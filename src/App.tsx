import { useEffect, useState } from "react";
import { SiteHeader } from "./components/SiteHeader";
import { ArchivePage } from "./pages/ArchivePage";
import { AttendancesPage } from "./pages/AttendancesPage";
import { MatchDetailPage } from "./pages/MatchDetailPage";
import { apiUrl } from "./lib/api";

export type SyncStatus = "checking" | "current" | "unavailable";

export function App() {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("checking");
  const path = window.location.pathname.replace(/\/$/, "") || "/";
  const isAttendancesPage = path === "/presencas";
  const matchRoute = path.match(/^\/jogos\/(.+)$/);
  const matchId = matchRoute ? decodeURIComponent(matchRoute[1]) : null;

  useEffect(() => {
    const controller = new AbortController();

    async function syncCalendar() {
      try {
        const response = await fetch(apiUrl("/api/sync/current"), {
          method: "POST",
          signal: controller.signal,
        });
        setSyncStatus(response.ok ? "current" : "unavailable");
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setSyncStatus("unavailable");
      }
    }

    void syncCalendar();
    return () => controller.abort();
  }, []);

  return (
    <>
      <SiteHeader currentPage={matchId ? "match" : isAttendancesPage ? "attendances" : "archive"} />

      {matchId
        ? <MatchDetailPage matchId={matchId} />
        : isAttendancesPage
        ? <AttendancesPage />
        : <ArchivePage syncStatus={syncStatus} />}

      <footer>
        <span>Feito em Coimbra para a Briosa.</span>
        <span>Dados guardados localmente · TheSportsDB + Transfermarkt</span>
      </footer>
    </>
  );
}
