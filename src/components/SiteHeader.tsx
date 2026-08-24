import { aacLogo } from "../lib/competitionIcons";

interface SiteHeaderProps {
  currentPage: "archive" | "attendances" | "match";
}

export function SiteHeader({ currentPage }: SiteHeaderProps) {
  return (
    <header className="site-header">
      <a className="brand" href="/" aria-label="Briosa — início">
        <img className="brand-mark" src={aacLogo} alt="" />
        <span>
          <strong>Briosa</strong>
          <small>Arquivo de jogos</small>
        </span>
      </a>

      <nav className="site-nav" aria-label="Navegação principal">
        <a href="/" aria-current={currentPage === "archive" || currentPage === "match" ? "page" : undefined}>Arquivo</a>
        <a href="/presencas" aria-current={currentPage === "attendances" ? "page" : undefined}>
          Jogos a que fui
        </a>
        <a
          href="https://smartfan.tickets/aacademica-oaf-futebol"
          target="_blank"
          rel="noreferrer"
        >
          Bilhetes <span className="external-link-mark" aria-hidden="true">↗</span>
        </a>
        <a
          href="https://smartfan.tickets/aacademica-oaf-quotas"
          target="_blank"
          rel="noreferrer"
        >
          Quotas <span className="external-link-mark" aria-hidden="true">↗</span>
        </a>
      </nav>
    </header>
  );
}
