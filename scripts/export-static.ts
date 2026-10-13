import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { listSeasons, listMatches, getMatch, getMatchDetails, getStanding } from "../server/database.ts";

const root = resolve("public/data");
mkdirSync(root, { recursive: true });
const write = (file: string, value: unknown) => {
  const target = resolve(root, file);
  mkdirSync(resolve(target, ".."), { recursive: true });
  writeFileSync(target, JSON.stringify(value));
};
const seasons = listSeasons();
write("seasons.json", { seasons });
let count = 0;
for (const { season } of seasons) {
  const matches = listMatches(season).map((match) => ({ ...match, attended: false }));
  write(`matches/${season}.json`, { season, matches });
  const standing = getStanding(season);
  if (standing) write(`standings/${season}.json`, { standing });
  for (const match of matches) {
    // Include even older source-specific match IDs, preserving the existing route.
    const details = getMatchDetails(match.id);
    write(`details/${encodeURIComponent(match.id)}.json`, {
      match: { ...(getMatch(match.id) ?? match), attended: false },
      ...details,
    });
    count++;
  }
}
console.log(`Exported ${count} matches in ${seasons.length} seasons`);
