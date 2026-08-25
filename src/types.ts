export interface SeasonSummary {
  season: string;
  matchCount: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
}

export interface Match {
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

export interface MatchDetails {
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

export interface LineupPlayer {
  teamSide: "home" | "away";
  role: "starter" | "substitute";
  playerId: string | null;
  playerName: string;
  shirtNumber: number | null;
  position: string | null;
  sortOrder: number;
}

export interface MatchEvent {
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

export interface MatchDetailResponse {
  match: Match;
  details: MatchDetails | null;
  lineups: {
    home: LineupPlayer[];
    away: LineupPlayer[];
  };
  events: MatchEvent[];
}

export interface StandingRow {
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
  isAcademica: boolean;
}

export interface Standing {
  season: string;
  competitionId: string;
  competitionName: string;
  stageName: string;
  sourceUrl: string;
  fetchedAt: string;
  rows: StandingRow[];
}
