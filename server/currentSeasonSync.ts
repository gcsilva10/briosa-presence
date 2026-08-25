import { load } from "cheerio";
import { ensureClubBadge } from "./clubs.ts";
import { database, teamName } from "./database.ts";
import { syncCurrentSeasonDetails } from "./currentDetailsSync.ts";
import { syncSeasonStanding } from "./standingsSync.ts";

const teamId = "134118";
const sourceBaseUrl = "https://www.thesportsdb.com";
const syncCooldownMs = 60_000;

const competitions = [
  { id: "4344", slug: "portuguese-primeira-liga", name: "Primeira Liga" },
  { id: "4662", slug: "portuguese-ligapro", name: "Liga Portugal 2" },
  { id: "5216", slug: "portugal-liga-3", name: "Liga 3" },
  { id: "4510", slug: "taca-de-portugal", name: "Taça de Portugal" },
  { id: "4509", slug: "taca-de-liga", name: "Taça da Liga" },
  { id: "4481", slug: "uefa-europa-league", name: "Liga Europa" },
] as const;

const months: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};

interface SyncedMatch {
  id: string;
  season: string;
  competitionId: string;
  competitionName: string;
  round: string | null;
  date: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  status: "finished" | "scheduled";
  sourceUrl: string;
}

export interface SyncResult {
  season: string;
  checkedAt: string;
  matchesFound: number;
  inserted: number;
  updated: number;
  detailsChecked: number;
  detailsUpdated: number;
  standingUpdated: boolean;
  cached: boolean;
  warnings: string[];
}

let lastResult: SyncResult | null = null;
let syncInFlight: Promise<SyncResult> | null = null;

function currentSeason(now = new Date()) {
  const year = now.getUTCFullYear();
  const startYear = now.getUTCMonth() >= 6 ? year : year - 1;
  return `${startYear}-${startYear + 1}`;
}

function normalizeTeamName(value: string) {
  const name = value.replace(/\s+/g, " ").trim();
  const searchable = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (
    searchable === "academica" ||
    searchable === "academica de coimbra" ||
    searchable.startsWith("associacao academica de c")
  ) return teamName;
  return name;
}

function parseDate(value: string) {
  const match = value.replace(/\s+/g, " ").trim().match(/^(\d{1,2}) ([A-Z][a-z]{2}) (\d{2})$/);
  if (!match || !months[match[2]]) return null;
  return `20${match[3]}-${months[match[2]]}-${match[1].padStart(2, "0")}`;
}

async function fetchCompetition(season: string, competition: (typeof competitions)[number]) {
  const pageUrl = `${sourceBaseUrl}/season/${competition.id}-${competition.slug}/${season}&t=${teamId}`;
  const response = await fetch(pageUrl, {
    headers: { "User-Agent": "BriosaPresence/0.1 (personal archive)" },
  });
  if (!response.ok) throw new Error(`${competition.name}: HTTP ${response.status}`);

  const $ = load(await response.text());
  const matches: SyncedMatch[] = [];

  $(".season-event-row").each((_, row) => {
    const cells = $(row).find("td");
    const homeAnchor = cells.eq(2).find("a[href^='/event/']").first();
    const awayAnchor = cells.eq(4).find("a[href^='/event/']").first();
    const eventHref = homeAnchor.attr("href");
    const eventId = eventHref?.match(/^\/event\/(\d+)/)?.[1];
    const date = parseDate(cells.eq(0).text());
    const score = cells.eq(3).text().trim().match(/^(\d+)\s*-\s*(\d+)$/);

    if (!eventId || !eventHref || !date) return;

    matches.push({
      id: `thesportsdb:${eventId}`,
      season,
      competitionId: competition.id,
      competitionName: competition.name,
      round: cells.eq(1).find("a").first().text().trim() || null,
      date,
      homeTeam: normalizeTeamName(homeAnchor.text()),
      awayTeam: normalizeTeamName(awayAnchor.text()),
      homeScore: score ? Number(score[1]) : null,
      awayScore: score ? Number(score[2]) : null,
      status: score ? "finished" : "scheduled",
      sourceUrl: `${sourceBaseUrl}${eventHref}`,
    });
  });

  return matches;
}

const findExisting = database.prepare(`
  SELECT id FROM matches
  WHERE season = ? AND competition_name = ? AND match_date = ?
    AND home_team = ? AND away_team = ?
  ORDER BY fetched_at DESC LIMIT 1
`);

const upsert = database.prepare(`
  INSERT INTO matches (
    id, season, competition_id, competition_name, round, match_date,
    home_team, away_team, home_score, away_score, status,
    source_name, source_url, fetched_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'TheSportsDB', ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    competition_id = excluded.competition_id,
    competition_name = excluded.competition_name,
    round = excluded.round,
    match_date = excluded.match_date,
    home_team = excluded.home_team,
    away_team = excluded.away_team,
    home_score = excluded.home_score,
    away_score = excluded.away_score,
    status = excluded.status,
    source_url = excluded.source_url,
    fetched_at = excluded.fetched_at
`);

async function performSync(): Promise<SyncResult> {
  const season = currentSeason();
  const pages = await Promise.allSettled(
    competitions.map((competition) => fetchCompetition(season, competition)),
  );
  const matches = pages.flatMap((page) => page.status === "fulfilled" ? page.value : []);
  const warnings = pages.flatMap((page) =>
    page.status === "rejected"
      ? [page.reason instanceof Error ? page.reason.message : "Fonte temporariamente indisponível"]
      : [],
  );

  if (warnings.length === pages.length) {
    throw new Error("Não foi possível verificar o calendário atual.");
  }

  const fetchedAt = new Date().toISOString();
  let inserted = 0;
  let updated = 0;

  database.exec("BEGIN");
  try {
    for (const match of matches) {
      const existing = findExisting.get(
        match.season, match.competitionName, match.date, match.homeTeam, match.awayTeam,
      ) as { id: string } | undefined;
      if (existing) updated += 1;
      else inserted += 1;

      upsert.run(
        existing?.id ?? match.id,
        match.season,
        match.competitionId,
        match.competitionName,
        match.round,
        match.date,
        match.homeTeam,
        match.awayTeam,
        match.homeScore,
        match.awayScore,
        match.status,
        match.sourceUrl,
        fetchedAt,
      );
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }

  const opponents = new Map<string, string>();
  for (const match of matches) {
    const opponent = match.homeTeam === teamName ? match.awayTeam : match.homeTeam;
    if (!opponents.has(opponent)) opponents.set(opponent, match.id.replace("thesportsdb:", ""));
  }
  for (const [opponent, eventId] of opponents) {
    const badge = await ensureClubBadge(opponent, [], false, eventId);
    if (badge.status === "failed") warnings.push(`Emblema de ${opponent}: ${badge.message}`);
  }

  const detailsResult = await syncCurrentSeasonDetails(season);
  warnings.push(...detailsResult.warnings);
  const standingResult = await syncSeasonStanding(season);
  if (standingResult.warning) warnings.push(`Classificação: ${standingResult.warning}`);

  lastResult = {
    season,
    checkedAt: fetchedAt,
    matchesFound: matches.length,
    inserted,
    updated,
    detailsChecked: detailsResult.checked,
    detailsUpdated: detailsResult.updated,
    standingUpdated: standingResult.updated,
    cached: false,
    warnings,
  };
  return lastResult;
}

export function syncCurrentSeason() {
  if (lastResult && Date.now() - Date.parse(lastResult.checkedAt) < syncCooldownMs) {
    return Promise.resolve({ ...lastResult, cached: true });
  }
  if (syncInFlight) return syncInFlight;

  syncInFlight = performSync().finally(() => {
    syncInFlight = null;
  });
  return syncInFlight;
}
