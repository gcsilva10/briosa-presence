import { useState } from "react";
import { SiteHeader } from "./components/SiteHeader";
import { ArchivePage } from "./pages/ArchivePage";
import { AttendancesPage } from "./pages/AttendancesPage";
import { MatchDetailPage } from "./pages/MatchDetailPage";
import { CloudLogin } from "./components/CloudLogin";

export type SyncStatus = "checking" | "current" | "unavailable";

export function App() {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("current");
  const path = window.location.pathname.replace(/\/$/, "") || "/";
  const isAttendancesPage = path === "/presencas";
  const matchRoute = path.match(/^\/jogos\/(.+)$/);
  const matchId = matchRoute ? decodeURIComponent(matchRoute[1]) : null;



  return (
    <>
      <SiteHeader currentPage={matchId ? "match" : isAttendancesPage ? "attendances" : "archive"} />

      <CloudLogin />
      {matchId
        ? <MatchDetailPage matchId={matchId} />
        : isAttendancesPage
        ? <AttendancesPage />
        : <ArchivePage syncStatus={syncStatus} />}

      <footer>
        <span>Feito em Coimbra para a Briosa.</span>
        <span>Arquivo estático · Presenças na cloud</span>
      </footer>
    </>
  );
}
