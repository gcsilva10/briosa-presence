import { backendAssetUrl } from "../lib/api";
import { aacLogo } from "../lib/competitionIcons";
import type { Standing } from "../types";

interface StandingsTableProps {
  standing: Standing | null;
}

function formatGoalDifference(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

export function StandingsTable({ standing }: StandingsTableProps) {
  if (!standing) return null;

  return (
    <section className="standings-section" aria-labelledby="standings-title">
      <div className="standings-heading">
        <div>
          <p className="eyebrow">{standing.competitionName}</p>
          <h3 id="standings-title">Classificação</h3>
        </div>
        <span>{standing.stageName}</span>
      </div>

      <div className="standings-scroll" tabIndex={0} aria-label="Tabela com deslocamento horizontal em ecrãs pequenos">
        <table className="standings-table">
          <caption>Classificação da {standing.competitionName} em {standing.season.replace("-", "/")}</caption>
          <thead>
            <tr>
              <th scope="col"><span className="visually-hidden">Posição</span>#</th>
              <th scope="col">Clube</th>
              <th scope="col" title="Jogos">J</th>
              <th scope="col" title="Vitórias">V</th>
              <th scope="col" title="Empates">E</th>
              <th scope="col" title="Derrotas">D</th>
              <th scope="col">Golos</th>
              <th scope="col" title="Diferença de golos">DG</th>
              <th scope="col">Pts</th>
            </tr>
          </thead>
          <tbody>
            {standing.rows.map((row) => (
              <tr className={row.isAcademica ? "is-academica" : undefined} key={`${row.teamId ?? row.teamName}-${row.position}`}>
                <td>{row.position}</td>
                <th scope="row">
                  {row.isAcademica || row.badgeUrl ? (
                    <img
                      src={row.isAcademica ? aacLogo : backendAssetUrl(row.badgeUrl) ?? undefined}
                      alt=""
                      loading="lazy"
                    />
                  ) : <span className="standing-badge-placeholder" aria-hidden="true" />}
                  <span>{row.teamName}</span>
                </th>
                <td>{row.played}</td>
                <td>{row.wins}</td>
                <td>{row.draws}</td>
                <td>{row.losses}</td>
                <td>{row.goalsFor}–{row.goalsAgainst}</td>
                <td>{formatGoalDifference(row.goalDifference)}</td>
                <td><strong>{row.points}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="standings-source">
        <a href={standing.sourceUrl} target="_blank" rel="noreferrer">Fonte da classificação ↗</a>
      </p>
    </section>
  );
}
