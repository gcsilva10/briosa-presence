import type { SeasonSummary as SeasonSummaryData } from "../types";

interface SeasonSummaryProps {
  summary: SeasonSummaryData;
}

export function SeasonSummary({ summary }: SeasonSummaryProps) {
  const played = summary.wins + summary.draws + summary.losses;

  return (
    <section className="summary" aria-label={`Resumo da época ${summary.season}`}>
      <div className="summary-primary">
        <span className="eyebrow">Época</span>
        <strong>{summary.season.replace("-", "/")}</strong>
      </div>
      <dl className="summary-stats">
        <div>
          <dt>Jogos</dt>
          <dd>{summary.matchCount}</dd>
        </div>
        <div>
          <dt>Vitórias</dt>
          <dd>{summary.wins}</dd>
        </div>
        <div>
          <dt>Empates</dt>
          <dd>{summary.draws}</dd>
        </div>
        <div>
          <dt>Derrotas</dt>
          <dd>{summary.losses}</dd>
        </div>
        <div>
          <dt>Golos</dt>
          <dd>{played ? `${summary.goalsFor}—${summary.goalsAgainst}` : "—"}</dd>
        </div>
      </dl>
    </section>
  );
}
