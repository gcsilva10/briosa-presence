import { aacLogo, getCompetitionIcon } from "../lib/competitionIcons";
import type { Match } from "../types";
import { backendAssetUrl } from "../lib/api";

const teamName = "Académica de Coimbra";

function getOutcome(match: Match) {
  if (match.status !== "finished" || match.homeScore === null || match.awayScore === null) return null;
  const isHome = match.homeTeam === teamName;
  const briosaScore = isHome ? match.homeScore : match.awayScore;
  const opponentScore = isHome ? match.awayScore : match.homeScore;
  if (briosaScore > opponentScore) return { label: "V", className: "win" };
  if (briosaScore === opponentScore) return { label: "E", className: "draw" };
  return { label: "D", className: "loss" };
}

interface MatchCardProps {
  match: Match;
  layout: "grid" | "timeline";
  isUpdating?: boolean;
  onAttendanceChange?: (match: Match, attended: boolean) => void;
}

export function MatchCard({ match, layout, isUpdating = false, onAttendanceChange }: MatchCardProps) {
  const date = new Date(`${match.date}T12:00:00`);
  const isHome = match.homeTeam === teamName;
  const opponent = isHome ? match.awayTeam : match.homeTeam;
  const opponentBadge = isHome ? match.awayTeamBadge : match.homeTeamBadge;
  const outcome = getOutcome(match);
  const competitionIcon = getCompetitionIcon(match.competitionName);
  const formattedDate = date.toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).replaceAll(" de ", " ").replace(".", "");
  const briosaIdentity = (
    <div className="briosa-team">
      <img src={aacLogo} alt="" />
      <span>Académica</span>
    </div>
  );
  const opponentIdentity = (
    <div className="opponent-team">
      {opponentBadge ? (
        <img className="opponent-badge" src={backendAssetUrl(opponentBadge) ?? undefined} alt="" loading="lazy" decoding="async" />
      ) : (
        <span className="opponent-placeholder" aria-hidden="true">{opponent.slice(0, 1)}</span>
      )}
      <h3>{opponent}</h3>
    </div>
  );

  return (
    <article className={`match-card match-card-${layout}`}>
      <div className="match-card-topline">
        <div className="competition-identity">
          {competitionIcon ? <img src={competitionIcon} alt="" /> : null}
          <span>
            <strong>{match.competitionName}</strong>
            {match.round ? <small>{match.round}</small> : null}
          </span>
        </div>
        {outcome ? <span className={`outcome ${outcome.className}`}>{outcome.label}</span> : null}
      </div>

      <div className="fixture">
        {isHome ? briosaIdentity : opponentIdentity}
        <span className="versus">vs.</span>
        {isHome ? opponentIdentity : briosaIdentity}
      </div>

      <div className="match-card-bottom">
        <div className="match-context">
          <time dateTime={match.date}>{formattedDate}</time>
          <span>{isHome ? "Casa" : "Fora"}</span>
        </div>

        <div className="match-actions">
          <div className="match-result">
            {match.status === "finished" ? (
              <strong aria-label={`Resultado ${match.homeScore} a ${match.awayScore}`}>
                {match.homeScore}<span>—</span>{match.awayScore}
              </strong>
            ) : (
              <span className="scheduled">Agendado</span>
            )}
          </div>

          <a className="match-details-link" href={`/jogos/${encodeURIComponent(match.id)}`}>
            Ver ficha <span aria-hidden="true">→</span>
          </a>

          {match.status === "finished" && onAttendanceChange ? (
            <button
              className={`attendance-button${match.attended ? " attended" : ""}`}
              type="button"
              disabled={isUpdating}
              aria-pressed={match.attended}
              onClick={() => onAttendanceChange(match, !match.attended)}
            >
              <span aria-hidden="true">{match.attended ? "✓" : "+"}</span>
              {isUpdating ? "A guardar…" : match.attended ? "Eu fui" : "Marcar presença"}
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
