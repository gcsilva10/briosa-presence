import { load } from "cheerio";
import { database, listMatches } from "./database.ts";
import { parseTransfermarktMatchDetails } from "./transfermarktMatchDetails.ts";

const transfermarktBaseUrl = "https://www.transfermarkt.com";
const staleAfterMs = 12 * 60 * 60 * 1_000;
const maxReportsPerSync = 4;
const requestDelayMs = 700;

interface ReportReference {
  id: string;
  url: string;
}

interface ExistingDetail {
  fetchedAt: string;
  hasReportContent: number;
}

export interface DetailsSyncResult {
  checked: number;
  updated: number;
  warnings: string[];
}

const compact = (value: string) => value.replace(/\s+/g, " ").trim();
const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

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

async function discoverReports(season: string) {
  const url = `${transfermarktBaseUrl}/academica-coimbra/spielplan/verein/2990/saison_id/${season.slice(0, 4)}`;
  const $ = load(await fetchText(url));
  const reports = new Map<string, ReportReference>();

  $("table tbody tr").each((_, row) => {
    const cells = $(row).find("td");
    const date = parseScheduleDate(cells.eq(1).text());
    const venue = compact(cells.eq(3).text());
    const href = cells.eq(9).find("a[href*='/spielbericht/']").first().attr("href");
    const id = href?.match(/spielbericht\/(\d+)/)?.[1];
    if (!date || !id || (venue !== "H" && venue !== "A")) return;
    reports.set(`${date}:${venue}`, {
      id,
      url: `${transfermarktBaseUrl}/spielbericht/index/spielbericht/${id}`,
    });
  });

  return reports;
}

const findDetails = database.prepare(`
  SELECT
    fetched_at AS fetchedAt,
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
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Transfermarkt', ?)
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

function storeDetails(matchId: string, reference: ReportReference, html: string) {
  const parsed = parseTransfermarktMatchDetails(html, reference.id);
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
      new Date().toISOString(),
    );
    database.prepare("DELETE FROM match_lineups WHERE match_id = ?").run(matchId);
    database.prepare("DELETE FROM match_events WHERE match_id = ?").run(matchId);
    for (const player of parsed.lineups) {
      insertLineup.run(
        matchId, player.teamSide, player.role, player.sortOrder, player.playerId,
        player.playerName, player.shirtNumber, player.position,
      );
    }
    for (const event of parsed.events) {
      insertEvent.run(
        event.id, matchId, event.minute, event.stoppageTime, event.teamSide, event.type,
        event.playerName, event.secondaryPlayerName, event.score, event.detail, event.sortOrder,
      );
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export async function syncCurrentSeasonDetails(season: string): Promise<DetailsSyncResult> {
  const warnings: string[] = [];
  const now = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  const matches = listMatches(season);
  const unfinished = matches
    .filter(({ status, date }) => status === "scheduled" && date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 3);
  const recentlyFinished = matches
    .filter(({ status, date }) => status === "finished" && now - Date.parse(`${date}T12:00:00Z`) < 21 * 24 * 60 * 60 * 1_000)
    .sort((a, b) => b.date.localeCompare(a.date));

  const candidates = [...recentlyFinished, ...unfinished]
    .filter((match, index, all) => all.findIndex(({ id }) => id === match.id) === index)
    .filter((match) => {
      const existing = findDetails.get(match.id) as unknown as ExistingDetail | undefined;
      if (!existing) return true;
      if (now - Date.parse(existing.fetchedAt) < staleAfterMs) return false;
      return match.status === "scheduled" || !Boolean(existing.hasReportContent);
    })
    .slice(0, maxReportsPerSync);

  if (candidates.length === 0) return { checked: 0, updated: 0, warnings };

  let reports: Map<string, ReportReference>;
  try {
    reports = await discoverReports(season);
  } catch (error) {
    return {
      checked: 0,
      updated: 0,
      warnings: [`Fichas: ${error instanceof Error ? error.message : "fonte indisponível"}`],
    };
  }

  let updated = 0;
  for (const match of candidates) {
    const venue = match.homeTeam === "Académica de Coimbra" ? "H" : "A";
    const reference = reports.get(`${match.date}:${venue}`);
    if (!reference) {
      warnings.push(`Ficha de ${match.date}: relatório ainda indisponível`);
      continue;
    }
    try {
      await wait(requestDelayMs);
      storeDetails(match.id, reference, await fetchText(reference.url));
      updated += 1;
    } catch (error) {
      warnings.push(`Ficha de ${match.date}: ${error instanceof Error ? error.message : "falhou"}`);
    }
  }

  return { checked: candidates.length, updated, warnings };
}

