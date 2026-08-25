import { load } from "cheerio";
import { canonicalizeClubName } from "./clubs.ts";
import { database } from "./database.ts";

const transfermarktBaseUrl = "https://www.transfermarkt.com";
const academicaTransfermarktId = "2990";
const standingCacheMs = 60 * 60 * 1_000;
const requestDelayMs = 700;

interface StandingTeam {
  position: number;
  teamId: string | null;
  teamName: string;
  badgeUrl: string | null;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

interface CompetitionReference {
  id: string;
  name: string;
  stageName: string;
}

export interface StandingSyncResult {
  season: string;
  updated: boolean;
  teams: number;
  stageName: string | null;
  warning?: string;
}

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const compact = (value: string) => value.replace(/\s+/g, " ").trim();
const parseInteger = (value: string) => {
  const match = value.replace(/\./g, "").match(/-?\d+/);
  return match ? Number(match[0]) : 0;
};

async function fetchText(url: string) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; BriosaPresence/0.1; personal archive)",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

function baseCompetitionForSeason(season: string): CompetitionReference {
  const startYear = Number(season.slice(0, 4));
  if (startYear <= 2015) {
    return { id: "PO1", name: "Primeira Liga", stageName: "Classificação final" };
  }
  if (startYear <= 2021 || startYear >= 2026) {
    return { id: "PO2", name: "Liga Portugal 2", stageName: "Classificação geral" };
  }
  return { id: "PT3A", name: "Liga 3", stageName: "Série B · 1.ª fase" };
}

function translateLiga3Stage(value: string) {
  const normalized = value.toLocaleLowerCase("en");
  if (normalized.includes("promotion")) return "Fase de subida";
  if (normalized.includes("relegation")) return "Fase de manutenção";
  return compact(value.replace(/^Liga 3\s*-?\s*/i, "")) || "Fase final";
}

async function findLiga3FinalPhase(season: string): Promise<CompetitionReference | null> {
  const startYear = season.slice(0, 4);
  const scheduleUrl = `${transfermarktBaseUrl}/academica-coimbra/spielplan/verein/${academicaTransfermarktId}/saison_id/${startYear}`;
  const $ = load(await fetchText(scheduleUrl));
  let result: CompetitionReference | null = null;

  $("a[href*='/startseite/wettbewerb/']").each((_, anchor) => {
    if (result) return;
    const href = $(anchor).attr("href") ?? "";
    const competitionId = href.match(/\/wettbewerb\/([^/]+)/)?.[1];
    if (!competitionId || competitionId === "PT3A" || !competitionId.startsWith("P3A")) return;
    const name = compact($(anchor).attr("title") ?? $(anchor).text());
    result = {
      id: competitionId,
      name: "Liga 3",
      stageName: translateLiga3Stage(name),
    };
  });

  return result;
}

function parseStandingTable(html: string): StandingTeam[] {
  const $ = load(html);
  const tables = $(".responsive-table table.items").toArray();
  const selectedTable = tables.find((table) => (
    $(table).find(`a[href*='/verein/${academicaTransfermarktId}/']`).length > 0
  ));
  if (!selectedTable) return [];

  const teams: StandingTeam[] = [];
  $(selectedTable).find("tbody tr").each((_, row) => {
    const cells = $(row).find("td");
    const teamAnchor = cells.eq(2).find("a[href*='/spielplan/verein/']").first();
    const fallbackAnchor = cells.eq(1).find("a[href*='/spielplan/verein/']").first();
    const anchor = teamAnchor.length ? teamAnchor : fallbackAnchor;
    const href = anchor.attr("href");
    const teamId = href?.match(/\/verein\/(\d+)/)?.[1] ?? null;
    const teamName = canonicalizeClubName(compact(anchor.attr("title") ?? anchor.text()));
    const goals = compact(cells.eq(7).text()).match(/(\d+)\s*:\s*(\d+)/);
    if (cells.length < 10 || !teamName || !goals) return;

    teams.push({
      position: parseInteger(cells.eq(0).text()),
      teamId,
      teamName: teamId === academicaTransfermarktId ? "Académica de Coimbra" : teamName,
      badgeUrl: cells.eq(1).find("img").first().attr("src") ?? null,
      played: parseInteger(cells.eq(3).text()),
      wins: parseInteger(cells.eq(4).text()),
      draws: parseInteger(cells.eq(5).text()),
      losses: parseInteger(cells.eq(6).text()),
      goalsFor: Number(goals[1]),
      goalsAgainst: Number(goals[2]),
      goalDifference: parseInteger(cells.eq(8).text()),
      points: parseInteger(cells.eq(9).text()),
    });
  });

  return teams.sort((a, b) => a.position - b.position);
}

const getExisting = database.prepare(`
  SELECT fetched_at AS fetchedAt, stage_name AS stageName
  FROM standings_meta
  WHERE season = ?
`);

const insertMeta = database.prepare(`
  INSERT INTO standings_meta (
    season, competition_id, competition_name, stage_name, source_url, fetched_at
  ) VALUES (?, ?, ?, ?, ?, ?)
`);

const insertTeam = database.prepare(`
  INSERT INTO standings (
    season, position, team_id, team_name, badge_url, played, wins, draws, losses,
    goals_for, goals_against, goal_difference, points
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

function storeStanding(
  season: string,
  competition: CompetitionReference,
  sourceUrl: string,
  teams: StandingTeam[],
) {
  database.exec("BEGIN");
  try {
    database.prepare("DELETE FROM standings_meta WHERE season = ?").run(season);
    insertMeta.run(
      season,
      competition.id,
      competition.name,
      competition.stageName,
      sourceUrl,
      new Date().toISOString(),
    );
    for (const team of teams) {
      insertTeam.run(
        season,
        team.position,
        team.teamId,
        team.teamName,
        team.badgeUrl,
        team.played,
        team.wins,
        team.draws,
        team.losses,
        team.goalsFor,
        team.goalsAgainst,
        team.goalDifference,
        team.points,
      );
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export async function syncSeasonStanding(season: string, force = false): Promise<StandingSyncResult> {
  const existing = getExisting.get(season) as unknown as { fetchedAt: string; stageName: string } | undefined;
  if (!force && existing && Date.now() - Date.parse(existing.fetchedAt) < standingCacheMs) {
    const teams = database.prepare("SELECT COUNT(*) AS count FROM standings WHERE season = ?").get(season) as { count: number };
    return { season, updated: false, teams: teams.count, stageName: existing.stageName };
  }

  let competition = baseCompetitionForSeason(season);
  try {
    if (competition.id === "PT3A") {
      const finalPhase = await findLiga3FinalPhase(season);
      if (finalPhase) competition = finalPhase;
      await wait(requestDelayMs);
    }

    let sourceUrl = `${transfermarktBaseUrl}/x/tabelle/wettbewerb/${competition.id}/saison_id/${season.slice(0, 4)}`;
    let teams = parseStandingTable(await fetchText(sourceUrl));

    if (teams.length === 0 && competition.id !== "PT3A" && competition.name === "Liga 3") {
      competition = baseCompetitionForSeason(season);
      await wait(requestDelayMs);
      sourceUrl = `${transfermarktBaseUrl}/x/tabelle/wettbewerb/${competition.id}/saison_id/${season.slice(0, 4)}`;
      teams = parseStandingTable(await fetchText(sourceUrl));
    }

    if (teams.length === 0) throw new Error("a tabela da Académica não foi encontrada");
    storeStanding(season, competition, sourceUrl, teams);
    return { season, updated: true, teams: teams.length, stageName: competition.stageName };
  } catch (error) {
    return {
      season,
      updated: false,
      teams: 0,
      stageName: null,
      warning: error instanceof Error ? error.message : "não foi possível atualizar a classificação",
    };
  }
}

