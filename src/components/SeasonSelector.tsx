import type { SeasonSummary } from "../types";

interface SeasonSelectorProps {
  seasons: SeasonSummary[];
  selectedSeason: string;
  onSelect: (season: string) => void;
}

const formatSeason = (season: string) => season.replace("-", "/");

export function SeasonSelector({ seasons, selectedSeason, onSelect }: SeasonSelectorProps) {
  return (
    <label className="season-selector">
      <span>Escolher época</span>
      <span className="select-shell">
        <select
          aria-label="Época"
          value={selectedSeason}
          onChange={(event) => onSelect(event.target.value)}
        >
          {seasons.map(({ season }) => (
            <option value={season} key={season}>
              {formatSeason(season)}
            </option>
          ))}
        </select>
        <span className="select-arrow" aria-hidden="true">↓</span>
      </span>
    </label>
  );
}
