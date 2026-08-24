import { useEffect, useMemo, useState } from "react";
import { MatchList } from "../components/MatchList";
import { saveAttendance } from "../lib/attendance";
import { apiUrl } from "../lib/api";
import type { Match } from "../types";

const formatSeason = (season: string) => season.replace("-", "/");

export function AttendancesPage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [updatingMatchId, setUpdatingMatchId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadAttendances() {
      try {
        const response = await fetch(apiUrl("/api/attendances"), { signal: controller.signal });
        if (!response.ok) throw new Error("Não foi possível carregar as presenças.");
        const data = await response.json() as { matches: Match[] };
        setMatches(data.matches);
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "Ocorreu um erro inesperado.");
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }

    void loadAttendances();
    return () => controller.abort();
  }, []);

  const matchesBySeason = useMemo(() => {
    const groups = new Map<string, Match[]>();
    for (const match of matches) {
      const seasonMatches = groups.get(match.season) ?? [];
      seasonMatches.push(match);
      groups.set(match.season, seasonMatches);
    }
    return [...groups.entries()];
  }, [matches]);

  const handleAttendanceChange = async (match: Match, attended: boolean) => {
    setUpdatingMatchId(match.id);
    setError(null);
    try {
      await saveAttendance(match.id, attended);
      setMatches((current) => current.filter(({ id }) => id !== match.id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível guardar a presença.");
    } finally {
      setUpdatingMatchId(null);
    }
  };

  return (
    <main>
      <section className="attendance-page" aria-labelledby="attendance-title">
        <div className="attendance-heading">
          <p className="eyebrow">Memórias da Briosa</p>
          <h1 id="attendance-title">Jogos a que fui</h1>
          <p>Todos os jogos que marcaste, organizados por época.</p>
        </div>

        {error ? <p className="error-state" role="alert">{error}</p> : null}
        {isLoading ? <p className="loading-state" aria-live="polite">A carregar as presenças…</p> : null}
        {!isLoading && matchesBySeason.length === 0 && !error ? (
          <div className="attendance-empty">
            <strong>A bancada ainda está vazia.</strong>
            <p>Marca “Eu fui” num jogo do arquivo e ele aparecerá aqui.</p>
            <a href="/">Explorar o arquivo</a>
          </div>
        ) : null}

        {!isLoading ? matchesBySeason.map(([season, seasonMatches]) => (
          <section className="attendance-season" key={season} aria-labelledby={`season-${season}`}>
            <div className="attendance-season-heading">
              <h2 id={`season-${season}`}>{formatSeason(season)}</h2>
              <span>{seasonMatches.length} {seasonMatches.length === 1 ? "jogo" : "jogos"}</span>
            </div>
            <MatchList
              matches={seasonMatches}
              layout="timeline"
              updatingMatchId={updatingMatchId}
              onAttendanceChange={handleAttendanceChange}
            />
          </section>
        )) : null}
      </section>
    </main>
  );
}
