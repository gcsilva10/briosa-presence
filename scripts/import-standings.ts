import { listSeasons } from "../server/database.ts";
import { syncSeasonStanding } from "../server/standingsSync.ts";

const requestedSeason = process.argv.find((argument) => argument.startsWith("--season="))?.split("=")[1];
const seasons = listSeasons()
  .map(({ season }) => season)
  .filter((season) => !requestedSeason || season === requestedSeason)
  .reverse();

for (const season of seasons) {
  const result = await syncSeasonStanding(season, true);
  if (result.warning) console.warn(`${season}: ${result.warning}`);
  else console.log(`${season}: ${result.teams} equipas · ${result.stageName}`);
  await new Promise((resolve) => setTimeout(resolve, 900));
}

