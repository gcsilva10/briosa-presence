import aacLogo from "../media/aac.png";
import liga1Icon from "../media/liga1.png";
import liga2Icon from "../media/liga2.png";
import liga3Icon from "../media/liga3.png";
import ligaEuropaIcon from "../media/liga_europa.png";
import supertacaIcon from "../media/supertaca.png";
import tacaDaLigaIcon from "../media/taca_da_liga.png";
import tacaPortugalIcon from "../media/taca_portugal.png";

const iconsByCompetition: Record<string, string> = {
  "Primeira Liga": liga1Icon,
  "Liga Portugal 2": liga2Icon,
  "Liga 3": liga3Icon,
  "Liga Europa": ligaEuropaIcon,
  "Supertaça Cândido de Oliveira": supertacaIcon,
  "Taça da Liga": tacaDaLigaIcon,
  "Taça de Portugal": tacaPortugalIcon,
};

export { aacLogo };

export const getCompetitionIcon = (competitionName: string) => iconsByCompetition[competitionName] ?? null;
