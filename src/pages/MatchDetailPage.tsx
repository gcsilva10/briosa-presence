import { useEffect, useState } from "react";
import { aacLogo, getCompetitionIcon } from "../lib/competitionIcons";
import type { LineupPlayer, MatchDetailResponse, MatchEvent } from "../types";
import { apiUrl, backendAssetUrl } from "../lib/api";

interface MatchDetailPageProps {
  matchId: string;
}

const teamName = "Académica de Coimbra";

function TeamBadge({ badge, name }: { badge: string | null; name: string }) {
  if (name === teamName) return <img src={aacLogo} alt="" />;
  if (badge) return <img src={backendAssetUrl(badge) ?? undefined} alt="" />;
  return <span className="detail-badge-placeholder" aria-hidden="true">{name.slice(0, 1)}</span>;
}

function PlayerList({ players, emptyLabel }: { players: LineupPlayer[]; emptyLabel: string }) {
  if (players.length === 0) return <p className="lineup-empty">{emptyLabel}</p>;
  return (
    <ol className="player-list">
      {players.map((player) => (
        <li key={`${player.role}-${player.sortOrder}-${player.playerId ?? player.playerName}`}>
          <span className="shirt-number">{player.shirtNumber ?? "–"}</span>
          <span>{player.playerName}</span>
          {player.position ? <small>{player.position}</small> : null}
        </li>
      ))}
    </ol>
  );
}

const eventLabels: Record<MatchEvent["type"], string> = {
  goal: "Golo",
  substitution: "Substituição",
  yellow: "Cartão amarelo",
  second_yellow: "Segundo amarelo",
  red: "Cartão vermelho",
};

function EventDescription({ event }: { event: MatchEvent }) {
  if (event.type === "substitution") {
    return <><strong>Entra {event.playerName ?? "—"}</strong><span>Sai {event.secondaryPlayerName ?? "—"}</span></>;
  }
  if (event.type === "goal") {
    return <><strong>{event.playerName ?? "Golo"}</strong>{event.secondaryPlayerName ? <span>Assistência: {event.secondaryPlayerName}</span> : null}</>;
  }
  return <strong>{event.playerName ?? eventLabels[event.type]}</strong>;
}

export function MatchDetailPage({ matchId }: MatchDetailPageProps) {
  const [data, setData] = useState<MatchDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function loadDetails() {
      try {
        const response = await fetch(apiUrl(`/api/matches/${encodeURIComponent(matchId)}`), { signal: controller.signal });
        if (!response.ok) throw new Error(response.status === 404 ? "Jogo não encontrado." : "Não foi possível carregar a ficha.");
        setData(await response.json() as MatchDetailResponse);
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "Não foi possível carregar a ficha.");
      }
    }
    void loadDetails();
    return () => controller.abort();
  }, [matchId]);

  if (error) return <main className="match-detail-page"><p className="error-state">{error}</p></main>;
  if (!data) return <main className="match-detail-page"><p className="loading-state" aria-live="polite">A carregar ficha do jogo…</p></main>;

  const { match, details, lineups, events } = data;
  const date = new Date(`${match.date}T12:00:00`).toLocaleDateString("pt-PT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const competitionIcon = getCompetitionIcon(match.competitionName);
  const homeStarters = lineups.home.filter(({ role }) => role === "starter");
  const awayStarters = lineups.away.filter(({ role }) => role === "starter");
  const homeBench = lineups.home.filter(({ role }) => role === "substitute");
  const awayBench = lineups.away.filter(({ role }) => role === "substitute");

  return (
    <main className="match-detail-page">
      <a className="back-link" href="/">← Voltar ao arquivo</a>

      <section className="match-detail-hero">
        <div className="detail-competition">
          {competitionIcon ? <img src={competitionIcon} alt="" /> : null}
          <span>{match.competitionName}{match.round ? ` · ${match.round}` : ""}</span>
        </div>
        <p className="detail-date">{date}</p>
        <div className="detail-scoreboard">
          <div className="detail-team">
            <TeamBadge badge={match.homeTeamBadge} name={match.homeTeam} />
            <h1>{match.homeTeam}</h1>
          </div>
          <div className="detail-result">
            {match.status === "finished" ? (
              <strong>{match.homeScore}<span>—</span>{match.awayScore}</strong>
            ) : (
              <><strong>{details?.kickoffTime ?? "vs."}</strong><small>Agendado</small></>
            )}
          </div>
          <div className="detail-team">
            <TeamBadge badge={match.awayTeamBadge} name={match.awayTeam} />
            <h1>{match.awayTeam}</h1>
          </div>
        </div>
      </section>

      <section className="match-facts" aria-label="Informação do jogo">
        <div><span>Início</span><strong>{details?.kickoffTime ?? "—"}</strong></div>
        <div><span>Estádio</span><strong>{details?.venue ?? "—"}</strong></div>
        <div><span>Assistência</span><strong>{details?.attendance?.toLocaleString("pt-PT") ?? "—"}</strong></div>
        <div><span>Árbitro</span><strong>{details?.referee ?? "—"}</strong></div>
      </section>

      {!details || details.status === "unavailable" ? (
        <section className="detail-unavailable">
          <p className="eyebrow">Dados em atualização</p>
          <h2>Esta ficha ainda não tem informação detalhada.</h2>
          <p>O calendário e o resultado continuam disponíveis. O importador voltará a tentar obter o relatório deste jogo.</p>
        </section>
      ) : null}

      {events.length > 0 ? (
        <section className="detail-section events-section">
          <div className="detail-section-heading"><p className="eyebrow">Minuto a minuto</p><h2>Acontecimentos</h2></div>
          <ol className="event-list">
            {events.map((event) => (
              <li key={event.id} className={`event-${event.type} event-${event.teamSide}`}>
                <time>{event.minute ? `${event.minute}'` : "—"}</time>
                <span className="event-marker" aria-hidden="true" />
                <div>
                  <small>{eventLabels[event.type]}{event.score ? ` · ${event.score}` : ""}</small>
                  <EventDescription event={event} />
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {lineups.home.length > 0 || lineups.away.length > 0 ? (
        <section className="detail-section lineups-section">
          <div className="detail-section-heading"><p className="eyebrow">Ficha técnica</p><h2>Onzes iniciais</h2></div>
          <div className="lineup-grid">
            <article>
              <header><h3>{match.homeTeam}</h3><span>{details?.homeFormation ?? "Formação não indicada"}</span></header>
              <PlayerList players={homeStarters} emptyLabel="Onze inicial indisponível." />
              <h4>Suplentes</h4>
              <PlayerList players={homeBench} emptyLabel="Suplentes não indicados." />
            </article>
            <article>
              <header><h3>{match.awayTeam}</h3><span>{details?.awayFormation ?? "Formação não indicada"}</span></header>
              <PlayerList players={awayStarters} emptyLabel="Onze inicial indisponível." />
              <h4>Suplentes</h4>
              <PlayerList players={awayBench} emptyLabel="Suplentes não indicados." />
            </article>
          </div>
        </section>
      ) : null}

      {details?.sourceUrl ? (
        <p className="detail-source">Fonte da ficha: <a href={details.sourceUrl} target="_blank" rel="noreferrer">{details.sourceName}</a></p>
      ) : null}
    </main>
  );
}
