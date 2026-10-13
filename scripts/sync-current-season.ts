import { syncCurrentSeason } from "../server/currentSeasonSync.ts";

const result = await syncCurrentSeason();
console.log(JSON.stringify(result, null, 2));
if (result.matchesFound === 0) throw new Error("Fonte sem jogos: calendário da época atual não foi atualizado.");
if (result.warnings.length) console.warn("Avisos de sincronização:", result.warnings.join(" | "));
