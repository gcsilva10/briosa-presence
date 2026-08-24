import { load } from "cheerio";
import { database } from "../server/database.ts";

const teamId = "134118";
const canonicalTeamName = "Académica de Coimbra";
const sourceBaseUrl = "https://www.thesportsdb.com";

const seasons = Array.from({ length: 16 }, (_, index) => {
  const startYear = 2011 + index;
  return `${startYear}-${startYear + 1}`;
});
const competitions = [
  { id: "4344", slug: "portuguese-primeira-liga", name: "Primeira Liga" },
  { id: "5216", slug: "portugal-liga-3", name: "Liga 3" },
  { id: "4662", slug: "portuguese-ligapro", name: "Liga Portugal 2" },
  { id: "4510", slug: "taca-de-portugal", name: "Taça de Portugal" },
  { id: "4509", slug: "taca-de-liga", name: "Taça da Liga" },
  { id: "4481", slug: "uefa-europa-league", name: "Liga Europa" },
] as const;

const months: Record<string, string> = {
  Jan: "01",
  Feb: "02",
  Mar: "03",
  Apr: "04",
  May: "05",
  Jun: "06",
  Jul: "07",
  Aug: "08",
  Sep: "09",
  Oct: "10",
  Nov: "11",
  Dec: "12",
};

interface ImportedMatch {
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
  sourceName: "TheSportsDB" | "Transfermarkt";
  sourceUrl: string;
}

function normalizeTeamName(name: string) {
  const compactName = name.replace(/\s+/g, " ").trim();
  const searchableName = compactName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-PT");

  if (
    searchableName === "academica" ||
    searchableName === "academica de coimbra" ||
    searchableName.startsWith("associacao academica de c")
  ) {
    return canonicalTeamName;
  }

  return compactName;
}

function parseDate(value: string): string | null {
  const match = value.replace(/\s+/g, " ").trim().match(/^(\d{1,2}) ([A-Z][a-z]{2}) (\d{2})$/);
  if (!match || !months[match[2]]) return null;
  return `20${match[3]}-${months[match[2]]}-${match[1].padStart(2, "0")}`;
}

function parsePage(html: string, season: string, competition: (typeof competitions)[number], sourceUrl: string) {
  const $ = load(html);
  const imported: ImportedMatch[] = [];

  $(".season-event-row").each((_, row) => {
    const cells = $(row).find("td");
    const eventAnchor = cells.eq(2).find("a[href^='/event/']").first();
    const href = eventAnchor.attr("href");
    const externalId = href?.match(/^\/event\/(\d+)/)?.[1];
    const date = parseDate(cells.eq(0).text());
    const homeTeam = normalizeTeamName(eventAnchor.text());
    const awayTeam = normalizeTeamName(cells.eq(4).find("a[href^='/event/']").first().text());
    const roundValue = cells.eq(1).find("a").first().text().trim();
    const score = cells.eq(3).text().trim().match(/^(\d+)\s*-\s*(\d+)$/);

    if (!externalId || !date || !homeTeam || !awayTeam) return;

    imported.push({
      id: `thesportsdb:${externalId}`,
      season,
      competitionId: competition.id,
      competitionName: competition.name,
      round: roundValue || null,
      date,
      homeTeam,
      awayTeam,
      homeScore: score ? Number(score[1]) : null,
      awayScore: score ? Number(score[2]) : null,
      status: score ? "finished" : "scheduled",
      sourceName: "TheSportsDB",
      sourceUrl: `${sourceBaseUrl}${href}`,
    });
  });

  return imported;
}

function parseTransfermarktDate(value: string) {
  const match = value.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function normalizeTransfermarktCompetition(value: string) {
  if (value === "Liga Portugal") return "Primeira Liga";
  if (value.includes("Liga Portugal 2") || value.includes("LigaPro")) return "Liga Portugal 2";
  if (value.includes("Allianz Cup") || value.includes("Taça da Liga")) return "Taça da Liga";
  if (value.includes("Taça de Portugal")) return "Taça de Portugal";
  if (value.includes("UEFA Europa League")) return "Liga Europa";
  if (value.includes("Supercup Candido de Oliveira")) return "Supertaça Cândido de Oliveira";
  return value;
}

const transfermarktCompetitionIds: Record<string, string> = {
  "Primeira Liga": "4344",
  "Liga Portugal 2": "4662",
  "Taça da Liga": "4509",
  "Taça de Portugal": "4510",
  "Liga Europa": "4481",
  "Supertaça Cândido de Oliveira": "tm:supercup",
};

async function fetchTransfermarktSeason(season: string) {
  const startYear = season.slice(0, 4);
  const pageUrl = `https://www.transfermarkt.com/academica-coimbra/spielplan/verein/2990/saison_id/${startYear}`;
  const response = await fetch(pageUrl, { headers: { "User-Agent": "Mozilla/5.0" } });

  if (!response.ok) throw new Error(`${response.status} ao consultar Transfermarkt ${season}`);

  const $ = load(await response.text());
  const imported: ImportedMatch[] = [];

  $("table").each((_, table) => {
    const heading = $(table).closest(".box").find(".content-box-headline").first().text().replace(/\s+/g, " ").trim();
    const competitionName = normalizeTransfermarktCompetition(heading);
    const competitionId = transfermarktCompetitionIds[competitionName];
    if (!competitionId) return;

    $(table).find("tbody tr").each((__, row) => {
      const cells = $(row).find("td");
      const date = parseTransfermarktDate(cells.eq(1).text());
      const venue = cells.eq(3).text().trim();
      const opponent = normalizeTeamName(cells.eq(6).find("a").first().text());
      const reportHref = cells.eq(9).find("a[href*='/spielbericht/']").first().attr("href");
      const externalId = reportHref?.match(/spielbericht\/(\d+)/)?.[1];
      const score = cells.eq(9).text().trim().match(/(\d+)\s*:\s*(\d+)/);

      if (!date || !externalId || !opponent || (venue !== "H" && venue !== "A")) return;

      imported.push({
        id: `transfermarkt:${externalId}`,
        season,
        competitionId,
        competitionName,
        round: cells.eq(0).text().replace(/\s+/g, " ").trim() || null,
        date,
        homeTeam: venue === "H" ? canonicalTeamName : opponent,
        awayTeam: venue === "A" ? canonicalTeamName : opponent,
        homeScore: score ? Number(score[1]) : null,
        awayScore: score ? Number(score[2]) : null,
        status: score ? "finished" : "scheduled",
        sourceName: "Transfermarkt",
        sourceUrl: `https://www.transfermarkt.com${reportHref}`,
      });
    });
  });

  return imported;
}

async function fetchCompetition(season: string, competition: (typeof competitions)[number]) {
  const sourceUrl = `${sourceBaseUrl}/season/${competition.id}-${competition.slug}/${season}&t=${teamId}`;
  const response = await fetch(sourceUrl, {
    headers: { "User-Agent": "BriosaPresence/0.1 (personal archive)" },
  });

  if (!response.ok) {
    throw new Error(`${response.status} ao consultar ${competition.name} ${season}`);
  }

  return parsePage(await response.text(), season, competition, sourceUrl);
}

function competitionWasPlayedInSeason(season: string, competitionId: string) {
  const startYear = Number(season.slice(0, 4));

  if (competitionId === "4344") return startYear >= 2012 && startYear <= 2015;
  if (competitionId === "4662") return (startYear >= 2016 && startYear <= 2021) || startYear === 2026;
  if (competitionId === "5216") return startYear >= 2022 && startYear <= 2025;
  if (competitionId === "4481") return startYear === 2012;
  return true;
}

const upsert = database.prepare(`
  INSERT INTO matches (
    id, season, competition_id, competition_name, round, match_date,
    home_team, away_team, home_score, away_score, status,
    source_name, source_url, fetched_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    season = excluded.season,
    competition_id = excluded.competition_id,
    competition_name = excluded.competition_name,
    round = excluded.round,
    match_date = excluded.match_date,
    home_team = excluded.home_team,
    away_team = excluded.away_team,
    home_score = excluded.home_score,
    away_score = excluded.away_score,
    status = excluded.status,
    source_name = excluded.source_name,
    source_url = excluded.source_url,
    fetched_at = excluded.fetched_at
`);

const findExistingMatch = database.prepare(`
  SELECT id
  FROM matches
  WHERE season = ?
    AND competition_name = ?
    AND match_date = ?
    AND home_team = ?
    AND away_team = ?
  ORDER BY fetched_at DESC
  LIMIT 1
`);

let importedCount = 0;

for (const season of seasons) {
  const startYear = Number(season.slice(0, 4));
  let matches: ImportedMatch[];

  if (startYear >= 2011 && startYear <= 2018) {
    matches = await fetchTransfermarktSeason(season);
  } else {
    const relevantCompetitions = competitions.filter((competition) =>
      competitionWasPlayedInSeason(season, competition.id),
    );
    const pages = await Promise.all(
      relevantCompetitions.map((competition) => fetchCompetition(season, competition)),
    );
    matches = pages.flat();
  }
  const fetchedAt = new Date().toISOString();

  database.exec("BEGIN");
  try {
    for (const match of matches) {
      const existing = findExistingMatch.get(
        match.season,
        match.competitionName,
        match.date,
        match.homeTeam,
        match.awayTeam,
      ) as { id: string } | undefined;

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
        match.sourceName,
        match.sourceUrl,
        fetchedAt,
      );
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }

  importedCount += matches.length;
  console.log(`${season}: ${matches.length} jogos`);
}

console.log(`Importação concluída: ${importedCount} jogos processados sem duplicação.`);
