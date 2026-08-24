import { load } from "cheerio";
import { database, listMatches, listSeasons, type MatchRow } from "../server/database.ts";
import { parseTransfermarktMatchDetails } from "../server/transfermarktMatchDetails.ts";

const transfermarktBaseUrl = "https://www.transfermarkt.com";
const sportsDbBaseUrl = "https://www.thesportsdb.com/api/v1/json/123";
const requestDelayMs = 900;
const force = process.argv.includes("--force");
const requestedSeason = process.argv.find((argument) => argument.startsWith("--season="))?.split("=")[1];
const requestedLimit = Number(process.argv.find((argument) => argument.startsWith("--limit="))?.split("=")[1] ?? "0");

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const compact = (value: string) => value.replace(/\s+/g, " ").trim();

interface ReportReference {
  id: string;
  url: string;
}

interface ExistingDetail {
  status: "complete" | "partial" | "unavailable";
  hasReportContent: number;
}

interface SportsDbEvent {
  strTimeLocal: string | null;
  strTime: string | null;
  strVenue: string | null;
}

function parseScheduleDate(value: string) {
  const match = value.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
}

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

async function discoverSeasonReports(season: string, matches: MatchRow[]) {
  const startYear = season.slice(0, 4);
  const url = `${transfermarktBaseUrl}/academica-coimbra/spielplan/verein/2990/saison_id/${startYear}`;
  const html = await fetchText(url);
  const $ = load(html);
  const byFixture = new Map<string, ReportReference>();

  $("table tbody tr").each((_, row) => {
    const cells = $(row).find("td");
    const date = parseScheduleDate(cells.eq(1).text());
    const venue = compact(cells.eq(3).text());
    const href = cells.eq(9).find("a[href*='/spielbericht/']").first().attr("href");
    const id = href?.match(/spielbericht\/(\d+)/)?.[1];
    if (!date || !id || (venue !== "H" && venue !== "A")) return;
    byFixture.set(`${date}:${venue}`, {
      id,
      url: `${transfermarktBaseUrl}/spielbericht/index/spielbericht/${id}`,
    });
  });

  const references = new Map<string, ReportReference>();
  for (const match of matches) {
    if (match.id.startsWith("transfermarkt:")) {
      const id = match.id.slice("transfermarkt:".length);
      references.set(match.id, {
        id,
        url: `${transfermarktBaseUrl}/spielbericht/index/spielbericht/${id}`,
      });
      continue;
    }
    const venue = match.homeTeam === "Académica de Coimbra" ? "H" : "A";
    const reference = byFixture.get(`${match.date}:${venue}`);
    if (reference) references.set(match.id, reference);
  }

  return references;
}

async function fetchSportsDbFallback(match: MatchRow) {
  const id = match.id.match(/^thesportsdb:(\d+)$/)?.[1];
  if (!id) return null;
  const response = await fetch(`${sportsDbBaseUrl}/lookupevent.php?id=${id}`, {
    headers: { "User-Agent": "BriosaPresence/0.1 (personal archive)" },
  });
  if (!response.ok) throw new Error(`TheSportsDB HTTP ${response.status}`);
  const data = await response.json() as { events: SportsDbEvent[] | null };
  const event = data.events?.[0];
  if (!event) return null;
  const rawTime = event.strTimeLocal || event.strTime;
  return {
    kickoffTime: rawTime?.match(/^(\d{2}:\d{2})/)?.[1] ?? null,
    venue: event.strVenue || null,
  };
}

const findDetails = database.prepare(`
  SELECT
    status,
    CASE WHEN
      EXISTS (SELECT 1 FROM match_lineups WHERE match_lineups.match_id = match_details.match_id)
      OR EXISTS (SELECT 1 FROM match_events WHERE match_events.match_id = match_details.match_id)
    THEN 1 ELSE 0 END AS hasReportContent
  FROM match_details
  WHERE match_id = ?
`);

const upsertDetails = database.prepare(`
  INSERT INTO match_details (
    match_id, transfermarkt_id, transfermarkt_url, kickoff_time, venue, attendance,
    referee, home_formation, away_formation, status, source_name, fetched_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(match_id) DO UPDATE SET
    transfermarkt_id = excluded.transfermarkt_id,
    transfermarkt_url = excluded.transfermarkt_url,
    kickoff_time = excluded.kickoff_time,
    venue = excluded.venue,
    attendance = excluded.attendance,
    referee = excluded.referee,
    home_formation = excluded.home_formation,
    away_formation = excluded.away_formation,
    status = excluded.status,
    source_name = excluded.source_name,
    fetched_at = excluded.fetched_at
`);

const insertLineup = database.prepare(`
  INSERT INTO match_lineups (
    match_id, team_side, role, sort_order, player_id, player_name, shirt_number, position
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertEvent = database.prepare(`
  INSERT INTO match_events (
    id, match_id, minute, stoppage_time, team_side, type, player_name,
    secondary_player_name, score, detail, sort_order
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

function storeTransfermarktDetails(matchId: string, reference: ReportReference, html: string) {
  const parsed = parseTransfermarktMatchDetails(html, reference.id);
  const fetchedAt = new Date().toISOString();
  database.exec("BEGIN");
  try {
    upsertDetails.run(
      matchId,
      reference.id,
      reference.url,
      parsed.kickoffTime,
      parsed.venue,
      parsed.attendance,
      parsed.referee,
      parsed.homeFormation,
      parsed.awayFormation,
      parsed.status,
      "Transfermarkt",
      fetchedAt,
    );
    database.prepare("DELETE FROM match_lineups WHERE match_id = ?").run(matchId);
    database.prepare("DELETE FROM match_events WHERE match_id = ?").run(matchId);
    for (const player of parsed.lineups) {
      insertLineup.run(
        matchId,
        player.teamSide,
        player.role,
        player.sortOrder,
        player.playerId,
        player.playerName,
        player.shirtNumber,
        player.position,
      );
    }
    for (const event of parsed.events) {
      insertEvent.run(
        event.id,
        matchId,
        event.minute,
        event.stoppageTime,
        event.teamSide,
        event.type,
        event.playerName,
        event.secondaryPlayerName,
        event.score,
        event.detail,
        event.sortOrder,
      );
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  return parsed;
}

async function storeSportsDbDetails(match: MatchRow) {
  const fallback = await fetchSportsDbFallback(match);
  if (!fallback) return false;
  upsertDetails.run(
    match.id,
    null,
    null,
    fallback.kickoffTime,
    fallback.venue,
    null,
    null,
    null,
    null,
    fallback.kickoffTime || fallback.venue ? "partial" : "unavailable",
    "TheSportsDB",
    new Date().toISOString(),
  );
  return true;
}

const seasons = listSeasons()
  .map(({ season }) => season)
  .filter((season) => !requestedSeason || season === requestedSeason);

if (requestedSeason && seasons.length === 0) {
  throw new Error(`A época ${requestedSeason} não existe na base de dados.`);
}

let processed = 0;
let attempted = 0;
let skipped = 0;
let failed = 0;

for (const season of seasons) {
  const matches = listMatches(season);
  let references = new Map<string, ReportReference>();
  try {
    references = await discoverSeasonReports(season, matches);
    await wait(requestDelayMs);
  } catch (error) {
    console.warn(`${season}: não foi possível ler o calendário do Transfermarkt (${String(error)})`);
  }

  for (const match of matches) {
    if (requestedLimit > 0 && attempted >= requestedLimit) break;
    const existing = findDetails.get(match.id) as unknown as ExistingDetail | undefined;
    if (
      !force
      && existing
      && match.status === "finished"
      && (existing.status === "complete" || Boolean(existing.hasReportContent))
    ) {
      skipped += 1;
      continue;
    }

    attempted += 1;
    const reference = references.get(match.id);
    try {
      if (reference) {
        const html = await fetchText(reference.url);
        const parsed = storeTransfermarktDetails(match.id, reference, html);
        console.log(`${season} · ${match.date}: ${parsed.lineups.length} jogadores, ${parsed.events.length} eventos`);
      } else {
        const stored = await storeSportsDbDetails(match);
        console.log(`${season} · ${match.date}: ${stored ? "metadados TheSportsDB" : "sem ficha disponível"}`);
      }
      processed += 1;
    } catch (error) {
      failed += 1;
      console.warn(`${season} · ${match.date}: falhou (${String(error)})`);
    }
    await wait(requestDelayMs);
  }

  console.log(`${season}: ${references.size}/${matches.length} jogos associados a relatórios`);
  if (requestedLimit > 0 && attempted >= requestedLimit) break;
}

console.log(`Importação de fichas concluída: ${processed} processadas, ${skipped} já existentes, ${failed} falharam.`);
