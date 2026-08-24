import type { Match } from "../types";
import { MatchCard } from "./MatchCard";

interface MatchListProps {
  matches: Match[];
  layout?: "grid" | "timeline";
  updatingMatchId?: string | null;
  onAttendanceChange?: (match: Match, attended: boolean) => void;
  emptyMessage?: string;
}

export function MatchList({
  matches,
  layout = "grid",
  updatingMatchId,
  onAttendanceChange,
  emptyMessage = "Ainda não existem jogos guardados para esta época.",
}: MatchListProps) {
  if (matches.length === 0) return <p className="empty-state">{emptyMessage}</p>;

  return (
    <div className={`matches matches-${layout}`} aria-label="Lista de jogos">
      {matches.map((match) => (
        <MatchCard
          key={match.id}
          match={match}
          layout={layout}
          isUpdating={updatingMatchId === match.id}
          onAttendanceChange={onAttendanceChange}
        />
      ))}
    </div>
  );
}
