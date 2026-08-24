interface CompetitionSelectorProps {
  competitions: string[];
  selectedCompetition: string;
  onSelect: (competition: string) => void;
}

export function CompetitionSelector({
  competitions,
  selectedCompetition,
  onSelect,
}: CompetitionSelectorProps) {
  return (
    <label className="season-selector">
      <span>Escolher competição</span>
      <span className="select-shell">
        <select
          aria-label="Competição"
          value={selectedCompetition}
          onChange={(event) => onSelect(event.target.value)}
        >
          <option value="all">Todas as competições</option>
          {competitions.map((competition) => (
            <option value={competition} key={competition}>{competition}</option>
          ))}
        </select>
        <span className="select-arrow" aria-hidden="true">↓</span>
      </span>
    </label>
  );
}
