import { useEffect, useMemo, useState } from "react";
import type { SyncStatus } from "../App";
import { CompetitionSelector } from "../components/CompetitionSelector";
import { MatchList } from "../components/MatchList";
import { SeasonSelector } from "../components/SeasonSelector";
import { SeasonSummary } from "../components/SeasonSummary";
import { saveAttendance } from "../lib/attendance";
import { apiUrl } from "../lib/api";
import type { Match, SeasonSummary as SeasonSummaryData } from "../types";

interface ArchivePageProps {
  syncStatus: SyncStatus;
}

export function ArchivePage({ syncStatus }: ArchivePageProps) {
  const [seasons, setSeasons] = useState<SeasonSummaryData[]>([]);
  const [selectedSeason, setSelectedSeason] = useState("");
  const [selectedCompetition, setSelectedCompetition] = useState("all");
  const [matches, setMatches] = useState<Match[]>([]);
  const [updatingMatchId, setUpdatingMatchId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (syncStatus === "checking") return;
    const controller = new AbortController();

    async function loadSeasons() {
      try {
        const response = await fetch(apiUrl("/api/seasons"), { signal: controller.signal });
        if (!response.ok) throw new Error("Não foi possível carregar as épocas.");
        const data = await response.json() as { seasons: SeasonSummaryData[] };
        setSeasons(data.seasons);
        setSelectedSeason((current) => current || data.seasons[0]?.season || "");
        if (data.seasons.length === 0) setIsLoading(false);
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "Ocorreu um erro inesperado.");
        setIsLoading(false);
      }
    }

    void loadSeasons();
    return () => controller.abort();
  }, [syncStatus]);

  useEffect(() => {
    if (!selectedSeason) return;
    const controller = new AbortController();
    setIsLoading(true);
    setError(null);

    async function loadMatches() {
      try {
        const response = await fetch(apiUrl(`/api/matches?season=${encodeURIComponent(selectedSeason)}`), {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Não foi possível carregar os jogos.");
        const data = await response.json() as { matches: Match[] };
        setMatches(data.matches);
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "Ocorreu um erro inesperado.");
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }

    void loadMatches();
    return () => controller.abort();
  }, [selectedSeason]);

  const competitions = useMemo(
    () => [...new Set(matches.map(({ competitionName }) => competitionName))].sort((a, b) => a.localeCompare(b, "pt")),
    [matches],
  );
  const visibleMatches = selectedCompetition === "all"
    ? matches
    : matches.filter(({ competitionName }) => competitionName === selectedCompetition);
  const selectedSummary = seasons.find(({ season }) => season === selectedSeason);

  const handleSeasonSelect = (season: string) => {
    setSelectedSeason(season);
    setSelectedCompetition("all");
  };

  const handleAttendanceChange = async (match: Match, attended: boolean) => {
    setUpdatingMatchId(match.id);
    setError(null);
    try {
      await saveAttendance(match.id, attended);
      setMatches((current) => current.map((item) => (
        item.id === match.id ? { ...item, attended } : item
      )));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível guardar a presença.");
    } finally {
      setUpdatingMatchId(null);
    }
  };

  return (
    <main id="top">
      <section className="hero">
        <p className="eyebrow">Associação Académica de Coimbra — O.A.F.</p>
        <h1>Cada jogo.<br /><em>Cada época.</em></h1>
        <p className="hero-copy">
          Um registo simples da caminhada da Briosa, da Liga 3 à Segunda Liga e às taças nacionais.
        </p>
      </section>

      <section className="archive" aria-labelledby="archive-title">
        <div className="archive-heading">
          <div>
            <p className="eyebrow">Arquivo</p>
            <h2 id="archive-title">Jogos por época</h2>
            <p className={`sync-status ${syncStatus}`} aria-live="polite">
              {syncStatus === "checking" ? "A atualizar calendário e fichas da época atual…" : null}
              {syncStatus === "current" ? "Calendário e fichas atuais verificados" : null}
              {syncStatus === "unavailable" ? "Arquivo disponível · atualização temporariamente indisponível" : null}
            </p>
          </div>

          <div className="archive-controls">
            {seasons.length > 0 ? (
              <SeasonSelector
                seasons={seasons}
                selectedSeason={selectedSeason}
                onSelect={handleSeasonSelect}
              />
            ) : null}
            {competitions.length > 0 ? (
              <CompetitionSelector
                competitions={competitions}
                selectedCompetition={selectedCompetition}
                onSelect={setSelectedCompetition}
              />
            ) : null}
          </div>
        </div>

        {selectedSummary ? <SeasonSummary summary={selectedSummary} /> : null}

        {error ? <p className="error-state" role="alert">{error}</p> : null}
        {isLoading ? <p className="loading-state" aria-live="polite">A carregar os jogos…</p> : null}
        {!isLoading && !error ? (
          <MatchList
            matches={visibleMatches}
            layout="grid"
            updatingMatchId={updatingMatchId}
            onAttendanceChange={handleAttendanceChange}
            emptyMessage="Não existem jogos desta competição nesta época."
          />
        ) : null}
      </section>
    </main>
  );
}
