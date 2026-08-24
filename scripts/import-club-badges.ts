import { database, teamName } from "../server/database.ts";
import { canonicalizeClubName, ensureClubBadge } from "../server/clubs.ts";

const refresh = process.argv.includes("--refresh");
const rebuild = process.argv.includes("--rebuild");
const apiDelayMs = 2_100;
const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const teamRows = database.prepare(`
  SELECT home_team AS name FROM matches WHERE home_team <> ?
  UNION
  SELECT away_team AS name FROM matches WHERE away_team <> ?
  ORDER BY name
`).all(teamName, teamName) as unknown as Array<{ name: string }>;

const aliasesByClub = new Map<string, string[]>();
for (const { name } of teamRows) {
  const canonicalName = canonicalizeClubName(name);
  const aliases = aliasesByClub.get(canonicalName) ?? [];
  aliases.push(name);
  aliasesByClub.set(canonicalName, aliases);
}

const eventRows = database.prepare(`
  SELECT id, home_team AS homeTeam, away_team AS awayTeam
  FROM matches
  WHERE source_name = 'TheSportsDB' AND id LIKE 'thesportsdb:%'
  ORDER BY match_date DESC
`).all() as unknown as Array<{ id: string; homeTeam: string; awayTeam: string }>;
const eventByClub = new Map<string, string>();
for (const match of eventRows) {
  const opponent = match.homeTeam === teamName ? match.awayTeam : match.homeTeam;
  const canonicalName = canonicalizeClubName(opponent);
  if (!eventByClub.has(canonicalName)) eventByClub.set(canonicalName, match.id.replace("thesportsdb:", ""));
}

if (rebuild) {
  database.exec("DELETE FROM club_aliases; DELETE FROM clubs;");
  console.log("Catálogo anterior limpo; os jogos e as presenças foram preservados.");
}

let downloaded = 0;
let cached = 0;
let missing = 0;
let failed = 0;
let apiRequests = 0;

console.log(`A processar ${aliasesByClub.size} clubes (${teamRows.length} variantes de nome)…`);

for (const [canonicalName, aliases] of aliasesByClub) {
  const result = await ensureClubBadge(canonicalName, aliases, refresh || rebuild, eventByClub.get(canonicalName));
  if (result.status === "downloaded") downloaded += 1;
  else if (result.status === "cached") cached += 1;
  else if (result.status === "missing") missing += 1;
  else failed += 1;

  if (result.requestedApi) apiRequests += 1;
  const detail = result.message ? ` · ${result.message}` : "";
  console.log(`[${result.status}] ${canonicalName}${detail}`);

  if (result.requestedApi) await wait(apiDelayMs);
}

console.log(`Concluído: ${downloaded} descarregados, ${cached} em cache, ${missing} sem emblema, ${failed} falhas, ${apiRequests} pedidos à API.`);
