import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bundledDatabasePath = resolve(projectRoot, "data", "briosa.sqlite");
const databasePath = process.env.DATABASE_PATH
  ? resolve(process.env.DATABASE_PATH)
  : bundledDatabasePath;

mkdirSync(dirname(databasePath), { recursive: true });
if (databasePath !== bundledDatabasePath && !existsSync(databasePath) && existsSync(bundledDatabasePath)) {
  copyFileSync(bundledDatabasePath, databasePath);
}

export const database = new DatabaseSync(databasePath);

database.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS matches (
    id TEXT PRIMARY KEY,
    season TEXT NOT NULL,
    competition_id TEXT NOT NULL,
    competition_name TEXT NOT NULL,
    round TEXT,
    match_date TEXT NOT NULL,
    home_team TEXT NOT NULL,
    away_team TEXT NOT NULL,
    home_score INTEGER,
    away_score INTEGER,
    status TEXT NOT NULL CHECK (status IN ('finished', 'scheduled')),
    source_name TEXT NOT NULL,
    source_url TEXT NOT NULL,
    fetched_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_matches_season_date
    ON matches (season, match_date);

  CREATE TABLE IF NOT EXISTS attendances (
    match_id TEXT PRIMARY KEY,
    attended_at TEXT NOT NULL,
    FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS clubs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    external_id TEXT UNIQUE,
    badge_url TEXT,
    badge_path TEXT,
    source_name TEXT NOT NULL,
    fetched_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS club_aliases (
    alias TEXT PRIMARY KEY,
    club_id TEXT NOT NULL,
    FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS match_details (
    match_id TEXT PRIMARY KEY,
    transfermarkt_id TEXT,
    transfermarkt_url TEXT,
    kickoff_time TEXT,
    venue TEXT,
    attendance INTEGER,
    referee TEXT,
    home_formation TEXT,
    away_formation TEXT,
    status TEXT NOT NULL CHECK (status IN ('complete', 'partial', 'unavailable')),
    source_name TEXT NOT NULL,
    fetched_at TEXT NOT NULL,
    FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS match_lineups (
    match_id TEXT NOT NULL,
    team_side TEXT NOT NULL CHECK (team_side IN ('home', 'away')),
    role TEXT NOT NULL CHECK (role IN ('starter', 'substitute')),
    sort_order INTEGER NOT NULL,
    player_id TEXT,
    player_name TEXT NOT NULL,
    shirt_number INTEGER,
    position TEXT,
    PRIMARY KEY (match_id, team_side, role, sort_order),
    FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS match_events (
    id TEXT PRIMARY KEY,
    match_id TEXT NOT NULL,
    minute INTEGER,
    stoppage_time INTEGER,
    team_side TEXT NOT NULL CHECK (team_side IN ('home', 'away')),
    type TEXT NOT NULL CHECK (type IN ('goal', 'substitution', 'yellow', 'second_yellow', 'red')),
    player_name TEXT,
    secondary_player_name TEXT,
    score TEXT,
    detail TEXT,
    sort_order INTEGER NOT NULL,
    FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_match_events_match
    ON match_events (match_id, sort_order);

  UPDATE matches
  SET home_team = 'Académica de Coimbra'
  WHERE home_team LIKE 'Associação Académica de C%';

  UPDATE matches
  SET away_team = 'Académica de Coimbra'
  WHERE away_team LIKE 'Associação Académica de C%';

  UPDATE matches
  SET home_team = 'Académica de Coimbra'
  WHERE home_team = 'Academica';

  UPDATE matches
  SET away_team = 'Académica de Coimbra'
  WHERE away_team = 'Academica';

`);

export const teamName = "Académica de Coimbra";

export interface MatchRow {
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
  attended: boolean;
  homeTeamBadge: string | null;
  awayTeamBadge: string | null;
}

export interface MatchDetailRow {
  kickoffTime: string | null;
  venue: string | null;
  attendance: number | null;
  referee: string | null;
  homeFormation: string | null;
  awayFormation: string | null;
  status: "complete" | "partial" | "unavailable";
  sourceName: string;
  sourceUrl: string | null;
  fetchedAt: string;
}

export interface LineupPlayerRow {
  teamSide: "home" | "away";
  role: "starter" | "substitute";
  playerId: string | null;
  playerName: string;
  shirtNumber: number | null;
  position: string | null;
  sortOrder: number;
}

export interface MatchEventRow {
  id: string;
  minute: number | null;
  stoppageTime: number | null;
  teamSide: "home" | "away";
  type: "goal" | "substitution" | "yellow" | "second_yellow" | "red";
  playerName: string | null;
  secondaryPlayerName: string | null;
  score: string | null;
  detail: string | null;
  sortOrder: number;
}

interface RawMatchRow extends Omit<MatchRow, "attended"> {
  attended: number;
}

const toMatchRows = (rows: RawMatchRow[]): MatchRow[] => rows.map((row) => ({
  ...row,
  attended: Boolean(row.attended),
}));

export function listMatches(season: string): MatchRow[] {
  const preferredSource = Number(season.slice(0, 4)) <= 2018 ? "Transfermarkt" : "TheSportsDB";

  const rows = database.prepare(`
    WITH ranked_matches AS (
      SELECT *,
        ROW_NUMBER() OVER (
          PARTITION BY season, competition_name, match_date, home_team, away_team
          ORDER BY (status = 'finished') DESC, fetched_at DESC, id DESC
        ) AS duplicate_rank
      FROM matches
      WHERE season = ? AND source_name = ?
    )
    SELECT
      ranked_matches.id,
      ranked_matches.season,
      ranked_matches.competition_id AS competitionId,
      ranked_matches.competition_name AS competitionName,
      ranked_matches.round,
      ranked_matches.match_date AS date,
      ranked_matches.home_team AS homeTeam,
      ranked_matches.away_team AS awayTeam,
      ranked_matches.home_score AS homeScore,
      ranked_matches.away_score AS awayScore,
      ranked_matches.status,
      ranked_matches.source_url AS sourceUrl,
      COALESCE(home_club.badge_path, home_club.badge_url) AS homeTeamBadge,
      COALESCE(away_club.badge_path, away_club.badge_url) AS awayTeamBadge,
      CASE WHEN attendances.match_id IS NULL THEN 0 ELSE 1 END AS attended
    FROM ranked_matches
    LEFT JOIN attendances ON attendances.match_id = ranked_matches.id
    LEFT JOIN club_aliases AS home_alias ON home_alias.alias = ranked_matches.home_team
    LEFT JOIN clubs AS home_club ON home_club.id = home_alias.club_id
    LEFT JOIN club_aliases AS away_alias ON away_alias.alias = ranked_matches.away_team
    LEFT JOIN clubs AS away_club ON away_club.id = away_alias.club_id
    WHERE duplicate_rank = 1
    ORDER BY match_date ASC, competition_name ASC
  `).all(season, preferredSource) as unknown as RawMatchRow[];

  return toMatchRows(rows);
}

export function getMatch(matchId: string): MatchRow | null {
  const row = database.prepare(`
    SELECT
      matches.id,
      matches.season,
      matches.competition_id AS competitionId,
      matches.competition_name AS competitionName,
      matches.round,
      matches.match_date AS date,
      matches.home_team AS homeTeam,
      matches.away_team AS awayTeam,
      matches.home_score AS homeScore,
      matches.away_score AS awayScore,
      matches.status,
      matches.source_url AS sourceUrl,
      COALESCE(home_club.badge_path, home_club.badge_url) AS homeTeamBadge,
      COALESCE(away_club.badge_path, away_club.badge_url) AS awayTeamBadge,
      CASE WHEN attendances.match_id IS NULL THEN 0 ELSE 1 END AS attended
    FROM matches
    LEFT JOIN attendances ON attendances.match_id = matches.id
    LEFT JOIN club_aliases AS home_alias ON home_alias.alias = matches.home_team
    LEFT JOIN clubs AS home_club ON home_club.id = home_alias.club_id
    LEFT JOIN club_aliases AS away_alias ON away_alias.alias = matches.away_team
    LEFT JOIN clubs AS away_club ON away_club.id = away_alias.club_id
    WHERE matches.id = ?
  `).get(matchId) as unknown as RawMatchRow | undefined;

  return row ? toMatchRows([row])[0] : null;
}

export function getMatchDetails(matchId: string) {
  const details = database.prepare(`
    SELECT
      kickoff_time AS kickoffTime,
      venue,
      attendance,
      referee,
      home_formation AS homeFormation,
      away_formation AS awayFormation,
      status,
      source_name AS sourceName,
      transfermarkt_url AS sourceUrl,
      fetched_at AS fetchedAt
    FROM match_details
    WHERE match_id = ?
  `).get(matchId) as unknown as MatchDetailRow | undefined;

  const lineups = database.prepare(`
    SELECT
      team_side AS teamSide,
      role,
      player_id AS playerId,
      player_name AS playerName,
      shirt_number AS shirtNumber,
      position,
      sort_order AS sortOrder
    FROM match_lineups
    WHERE match_id = ?
    ORDER BY team_side, role, sort_order
  `).all(matchId) as unknown as LineupPlayerRow[];

  const events = database.prepare(`
    SELECT
      id,
      minute,
      stoppage_time AS stoppageTime,
      team_side AS teamSide,
      type,
      player_name AS playerName,
      secondary_player_name AS secondaryPlayerName,
      score,
      detail,
      sort_order AS sortOrder
    FROM match_events
    WHERE match_id = ?
    ORDER BY sort_order
  `).all(matchId) as unknown as MatchEventRow[];

  return {
    details: details ?? null,
    lineups: {
      home: lineups.filter(({ teamSide }) => teamSide === "home"),
      away: lineups.filter(({ teamSide }) => teamSide === "away"),
    },
    events,
  };
}

export function listAttendedMatches(): MatchRow[] {
  const rows = database.prepare(`
    SELECT
      matches.id,
      matches.season,
      matches.competition_id AS competitionId,
      matches.competition_name AS competitionName,
      matches.round,
      matches.match_date AS date,
      matches.home_team AS homeTeam,
      matches.away_team AS awayTeam,
      matches.home_score AS homeScore,
      matches.away_score AS awayScore,
      matches.status,
      matches.source_url AS sourceUrl,
      COALESCE(home_club.badge_path, home_club.badge_url) AS homeTeamBadge,
      COALESCE(away_club.badge_path, away_club.badge_url) AS awayTeamBadge,
      1 AS attended
    FROM attendances
    INNER JOIN matches ON matches.id = attendances.match_id
    LEFT JOIN club_aliases AS home_alias ON home_alias.alias = matches.home_team
    LEFT JOIN clubs AS home_club ON home_club.id = home_alias.club_id
    LEFT JOIN club_aliases AS away_alias ON away_alias.alias = matches.away_team
    LEFT JOIN clubs AS away_club ON away_club.id = away_alias.club_id
    ORDER BY matches.season DESC, matches.match_date DESC, matches.competition_name ASC
  `).all() as unknown as RawMatchRow[];

  return toMatchRows(rows);
}

export function setAttendance(matchId: string, attended: boolean): boolean | null {
  const match = database.prepare("SELECT id FROM matches WHERE id = ?").get(matchId);
  if (!match) return null;

  if (attended) {
    database.prepare(`
      INSERT INTO attendances (match_id, attended_at)
      VALUES (?, ?)
      ON CONFLICT(match_id) DO UPDATE SET attended_at = excluded.attended_at
    `).run(matchId, new Date().toISOString());
  } else {
    database.prepare("DELETE FROM attendances WHERE match_id = ?").run(matchId);
  }

  return attended;
}

interface SeasonRecord {
  season: string;
  matchCount: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
}

export function listSeasons(): SeasonRecord[] {
  const seasons = database.prepare(`
    SELECT DISTINCT season
    FROM matches
    ORDER BY season DESC
  `).all() as unknown as Array<{ season: string }>;

  return seasons.map(({ season }) => {
    const matches = listMatches(season).filter((match) => match.status === "finished");
    let wins = 0;
    let draws = 0;
    let losses = 0;
    let goalsFor = 0;
    let goalsAgainst = 0;

    for (const match of matches) {
      const isHome = match.homeTeam === teamName;
      const scored = isHome ? match.homeScore : match.awayScore;
      const conceded = isHome ? match.awayScore : match.homeScore;

      if (scored === null || conceded === null) continue;
      goalsFor += scored;
      goalsAgainst += conceded;
      if (scored > conceded) wins += 1;
      else if (scored === conceded) draws += 1;
      else losses += 1;
    }

    return {
      season,
      matchCount: listMatches(season).length,
      wins,
      draws,
      losses,
      goalsFor,
      goalsAgainst,
    };
  });
}
