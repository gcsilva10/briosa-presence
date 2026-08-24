import { existsSync, mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { database, teamName } from "./database.ts";

const projectRoot = resolve(import.meta.dirname, "..");
const clubMediaDirectory = resolve(projectRoot, "public", "media", "clubs");
const apiBaseUrl = "https://www.thesportsdb.com/api/v1/json/123";
const academicaTeamId = "134118";
const retryAfterMs = 7 * 24 * 60 * 60 * 1_000;
const apiDelayMs = 2_100;

mkdirSync(clubMediaDirectory, { recursive: true });

const normalizeKey = (value: string) => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[.]/g, "")
  .replace(/\s+/g, " ")
  .trim()
  .toLocaleLowerCase("pt-PT");

const canonicalNames: Record<string, string> = {
  "academico viseu": "Académico Viseu",
  "atletico": "Atlético CP",
  "atletico cp": "Atlético CP",
  "cd cova da piedade": "Cova da Piedade",
  "cova piedade": "Cova da Piedade",
  "covilha": "Sporting da Covilhã",
  "sc covilha": "Sporting da Covilhã",
  "sporting da covilha": "Sporting da Covilhã",
  "cd nacional de madeira": "Nacional da Madeira",
  "nacional": "Nacional da Madeira",
  "estoril": "Estoril Praia",
  "estoril-praia": "Estoril Praia",
  "fc pacos de ferreira": "Paços de Ferreira",
  "pacos ferreira": "Paços de Ferreira",
  "fc porto": "FC Porto",
  "porto": "FC Porto",
  "fc porto b": "FC Porto B",
  "porto b": "FC Porto B",
  "famalicao": "Famalicão",
  "farense": "Farense",
  "sc farense": "Farense",
  "guimaraes": "Vitória de Guimarães",
  "vit guimaraes": "Vitória de Guimarães",
  "guimaraes b": "Vitória de Guimarães B",
  "vitoria de guimaraes b": "Vitória de Guimarães B",
  "leiria": "União de Leiria",
  "uniao de leiria": "União de Leiria",
  "leixoes": "Leixões",
  "maritimo": "Marítimo",
  "sporting": "Sporting CP",
  "sporting cp": "Sporting CP",
  "sporting lisbon": "Sporting CP",
  "sporting b": "Sporting CP B",
  "sporting cp b": "Sporting CP B",
  "uniao da madeira": "União da Madeira",
  "uniao madeira": "União da Madeira",
  "vitoria setubal": "Vitória de Setúbal",
};

const searchNames: Record<string, string> = {
  "1 Dezembro": "1º Dezembro",
  "AVS": "AVS Futebol SAD",
  "Alverca": "FC Alverca",
  "Amarante": "Amarante FC",
  "Amora": "Amora FC",
  "Arouca": "FC Arouca",
  "Beira-Mar": "Beira Mar",
  "Benfica B": "SL Benfica B",
  "Benfica e Castelo Branco": "Benfica Castelo Branco",
  "Boavista": "Boavista FC",
  "Braga": "SC Braga",
  "Braga B": "SC Braga B",
  "Casa Pia": "Casa Pia AC",
  "Chaves": "GD Chaves",
  "Cova da Piedade": "CD Cova da Piedade",
  "Desportivo Aves": "Desportivo das Aves",
  "Estoril Praia": "Estoril",
  "Famalicão": "FC Famalicão",
  "Farense": "SC Farense",
  "Felgueiras": "Felgueiras 1932",
  "Freamunde": "SC Freamunde",
  "GD Tourizense": "Tourizense",
  "Gil Vicente": "Gil Vicente FC",
  "Lusitano de Évora": "Lusitano Evora",
  "Lusitânia Lourosa": "Lusitânia de Lourosa",
  "Nacional da Madeira": "CD Nacional",
  "Oliveira do Hospital": "FC Oliveira do Hospital",
  "Oriental": "Clube Oriental de Lisboa",
  "Os Belenenses": "CF Os Belenenses",
  "Paços de Ferreira": "Pacos Ferreira",
  "Portimonense": "Portimonense SC",
  "Sporting da Covilhã": "Sporting Covilha",
  "Sporting CP B": "Sporting Lisbon B",
  "Hapoel Tel Aviv": "Hapoel Tel-Aviv",
  "União da Madeira": "Uniao Madeira",
  "União de Leiria": "Uniao Leiria",
  "União de Santarém": "Uniao Santarem",
  "Vitória de Guimarães": "Vitoria Guimaraes",
  "Vitória de Guimarães B": "Vitoria Guimaraes B",
  "Vitória de Setúbal": "Vitoria Setubal",
};

const manualBadgeUrls: Record<string, string> = {
  "Freamunde": "https://afporto.pt/wp-content/uploads/2022/02/Sport-Clube-de-Freamunde.png",
  "GD Tourizense": "https://tourizense.pt/cdn/shop/files/ScoreImageHandler.png?v=1747132397&width=500",
  "Hapoel Tel Aviv": "https://r2.thesportsdb.com/images/media/team/badge/19siqf1781239772.png",
  "Santa Maria": "https://commons.wikimedia.org/wiki/Special:Redirect/file/SMFC%20logo.png",
};

interface ClubRecord {
  id: string;
  name: string;
  externalId: string | null;
  badgeUrl: string | null;
  badgePath: string | null;
  fetchedAt: string;
}

interface SportsDbTeam {
  idTeam: string;
  strTeam: string;
  strTeamAlternate: string | null;
  strSport: string;
  strCountry: string | null;
  strBadge: string | null;
}

interface SportsDbEvent {
  idHomeTeam: string;
  idAwayTeam: string;
  strHomeTeam: string;
  strAwayTeam: string;
  strHomeTeamBadge: string | null;
  strAwayTeamBadge: string | null;
}

export interface ClubImportResult {
  name: string;
  status: "downloaded" | "cached" | "missing" | "failed";
  badgePath: string | null;
  message?: string;
  requestedApi: boolean;
}

export const canonicalizeClubName = (name: string) => canonicalNames[normalizeKey(name)] ?? name.trim();

const slugify = (name: string) => normalizeKey(name)
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "");

const getClubByAlias = database.prepare(`
  SELECT
    clubs.id,
    clubs.name,
    clubs.external_id AS externalId,
    clubs.badge_url AS badgeUrl,
    clubs.badge_path AS badgePath,
    clubs.fetched_at AS fetchedAt
  FROM club_aliases
  INNER JOIN clubs ON clubs.id = club_aliases.club_id
  WHERE club_aliases.alias = ?
`);

const getClubByName = database.prepare(`
  SELECT
    id,
    name,
    external_id AS externalId,
    badge_url AS badgeUrl,
    badge_path AS badgePath,
    fetched_at AS fetchedAt
  FROM clubs
  WHERE name = ?
`);

const getClubByExternalId = database.prepare(`
  SELECT
    id,
    name,
    external_id AS externalId,
    badge_url AS badgeUrl,
    badge_path AS badgePath,
    fetched_at AS fetchedAt
  FROM clubs
  WHERE external_id = ?
`);

const upsertClub = database.prepare(`
  INSERT INTO clubs (id, name, external_id, badge_url, badge_path, source_name, fetched_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    name = excluded.name,
    external_id = COALESCE(excluded.external_id, clubs.external_id),
    badge_url = COALESCE(excluded.badge_url, clubs.badge_url),
    badge_path = COALESCE(excluded.badge_path, clubs.badge_path),
    source_name = excluded.source_name,
    fetched_at = excluded.fetched_at
`);

const upsertAlias = database.prepare(`
  INSERT INTO club_aliases (alias, club_id)
  VALUES (?, ?)
  ON CONFLICT(alias) DO UPDATE SET club_id = excluded.club_id
`);

function addAliases(clubId: string, aliases: string[]) {
  for (const alias of new Set(aliases.map((value) => value.trim()).filter(Boolean))) {
    upsertAlias.run(alias, clubId);
  }
}

async function downloadBadge(badgeUrl: string, canonicalName: string) {
  const urlExtension = extname(new URL(badgeUrl).pathname).toLowerCase();
  const extension = [".png", ".webp", ".jpg", ".jpeg"].includes(urlExtension) ? urlExtension : ".png";
  const publicPath = `/media/clubs/${slugify(canonicalName)}${extension}`;
  const filePath = resolve(projectRoot, "public", `.${publicPath}`);
  const response = await fetch(badgeUrl, {
    headers: { "User-Agent": "BriosaPresence/0.1 (personal archive)" },
  });

  if (!response.ok) throw new Error(`HTTP ${response.status} ao descarregar o emblema`);
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) throw new Error("A resposta do emblema não é uma imagem");

  await writeFile(filePath, Buffer.from(await response.arrayBuffer()));
  return publicPath;
}

async function searchTeam(name: string) {
  const query = searchNames[name] ?? name;
  const url = `${apiBaseUrl}/searchteams.php?t=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: { "User-Agent": "BriosaPresence/0.1 (personal archive)" },
  });
  if (!response.ok) throw new Error(`TheSportsDB respondeu com HTTP ${response.status}`);
  const data = await response.json() as { teams: SportsDbTeam[] | null };
  const team = data.teams?.find(({ strSport }) => strSport === "Soccer") ?? null;
  const isForeignOpponent = name === "Hapoel Tel Aviv" || name === "Viktoria Plzeň";
  if (team && !isForeignOpponent && team.strCountry && team.strCountry !== "Portugal") return null;
  return team;
}

async function lookupEventOpponent(eventId: string): Promise<SportsDbTeam | null> {
  const response = await fetch(`${apiBaseUrl}/lookupevent.php?id=${encodeURIComponent(eventId)}`, {
    headers: { "User-Agent": "BriosaPresence/0.1 (personal archive)" },
  });
  if (!response.ok) throw new Error(`TheSportsDB respondeu com HTTP ${response.status}`);
  const data = await response.json() as { events: SportsDbEvent[] | null };
  const event = data.events?.[0];
  if (!event) return null;

  if (event.idHomeTeam === academicaTeamId) {
    return {
      idTeam: event.idAwayTeam,
      strTeam: event.strAwayTeam,
      strTeamAlternate: null,
      strSport: "Soccer",
      strCountry: null,
      strBadge: event.strAwayTeamBadge,
    };
  }
  if (event.idAwayTeam === academicaTeamId) {
    return {
      idTeam: event.idHomeTeam,
      strTeam: event.strHomeTeam,
      strTeamAlternate: null,
      strSport: "Soccer",
      strCountry: null,
      strBadge: event.strHomeTeamBadge,
    };
  }
  return null;
}

async function lookupTeam(teamId: string): Promise<SportsDbTeam | null> {
  const response = await fetch(`${apiBaseUrl}/lookupteam.php?id=${encodeURIComponent(teamId)}`, {
    headers: { "User-Agent": "BriosaPresence/0.1 (personal archive)" },
  });
  if (!response.ok) throw new Error(`TheSportsDB respondeu com HTTP ${response.status}`);
  const data = await response.json() as { teams: SportsDbTeam[] | null };
  return data.teams?.find(({ strSport }) => strSport === "Soccer") ?? null;
}

export async function ensureClubBadge(
  team: string,
  aliases: string[] = [],
  refresh = false,
  eventId?: string,
): Promise<ClubImportResult> {
  if (team === teamName) {
    return { name: team, status: "cached", badgePath: null, requestedApi: false };
  }

  const canonicalName = canonicalizeClubName(team);
  const existing = (getClubByAlias.get(team) ?? getClubByName.get(canonicalName)) as ClubRecord | undefined;
  const knownAliases = [team, canonicalName, ...aliases];

  if (!refresh && existing?.badgePath && existsSync(resolve(projectRoot, "public", `.${existing.badgePath}`))) {
    addAliases(existing.id, knownAliases);
    return { name: canonicalName, status: "cached", badgePath: existing.badgePath, requestedApi: false };
  }

  if (!refresh && existing?.badgeUrl) {
    try {
      const badgePath = await downloadBadge(existing.badgeUrl, canonicalName);
      upsertClub.run(existing.id, canonicalName, existing.externalId, existing.badgeUrl, badgePath, "TheSportsDB", new Date().toISOString());
      addAliases(existing.id, knownAliases);
      return { name: canonicalName, status: "downloaded", badgePath, requestedApi: false };
    } catch {
      // A pesquisa abaixo pode devolver um URL de emblema atualizado.
    }
  }

  const manualBadgeUrl = manualBadgeUrls[canonicalName];
  if (manualBadgeUrl) {
    try {
      const badgePath = await downloadBadge(manualBadgeUrl, canonicalName);
      const clubId = existing?.id ?? `club:${slugify(canonicalName)}`;
      upsertClub.run(
        clubId,
        canonicalName,
        existing?.externalId ?? null,
        manualBadgeUrl,
        badgePath,
        "Fonte oficial/Wikimedia",
        new Date().toISOString(),
      );
      addAliases(clubId, knownAliases);
      return { name: canonicalName, status: "downloaded", badgePath, requestedApi: false };
    } catch {
      // Mantém a pesquisa TheSportsDB como fallback.
    }
  }

  if (!refresh && existing?.externalId) {
    try {
      let found = await lookupTeam(existing.externalId);
      if (!found?.strBadge) {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, apiDelayMs));
        const searched = await searchTeam(canonicalName);
        if (searched && canonicalizeClubName(searched.strTeam) === canonicalName) found = searched;
      }
      const badgePath = found?.strBadge ? await downloadBadge(found.strBadge, canonicalName) : null;
      upsertClub.run(
        existing.id,
        canonicalName,
        existing.externalId,
        found?.strBadge ?? null,
        badgePath,
        "TheSportsDB",
        new Date().toISOString(),
      );
      addAliases(existing.id, [...knownAliases, found?.strTeam ?? ""]);
      return {
        name: canonicalName,
        status: badgePath ? "downloaded" : "missing",
        badgePath,
        requestedApi: true,
      };
    } catch (error) {
      return {
        name: canonicalName,
        status: "failed",
        badgePath: null,
        message: error instanceof Error ? error.message : "Erro desconhecido",
        requestedApi: true,
      };
    }
  }

  if (!refresh && existing && Date.now() - Date.parse(existing.fetchedAt) < retryAfterMs) {
    addAliases(existing.id, knownAliases);
    return { name: canonicalName, status: "missing", badgePath: null, requestedApi: false };
  }

  try {
    let found = eventId
      ? await lookupEventOpponent(eventId)
      : await searchTeam(canonicalName);
    if (eventId && found && !found.strBadge) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, apiDelayMs));
      found = await lookupTeam(found.idTeam) ?? found;
      if (!found.strBadge) {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, apiDelayMs));
        const searched = await searchTeam(canonicalName);
        if (searched && canonicalizeClubName(searched.strTeam) === canonicalName) found = searched;
      }
    }
    const fetchedAt = new Date().toISOString();
    const clubWithExternalId = found
      ? getClubByExternalId.get(found.idTeam) as ClubRecord | undefined
      : undefined;
    const existingMatchesExternalId = !existing?.externalId || existing.externalId === found?.idTeam;
    const clubId = clubWithExternalId?.id
      ?? (existingMatchesExternalId ? existing?.id : undefined)
      ?? `club:${slugify(canonicalName)}`;
    let badgePath: string | null = null;

    if (found?.strBadge) badgePath = await downloadBadge(found.strBadge, canonicalName);

    upsertClub.run(
      clubId,
      canonicalName,
      found?.idTeam ?? null,
      found?.strBadge ?? null,
      badgePath,
      found ? "TheSportsDB" : "TheSportsDB (sem resultado)",
      fetchedAt,
    );
    addAliases(clubId, [
      ...knownAliases,
      found?.strTeam ?? "",
      ...(found?.strTeamAlternate?.split(",") ?? []),
    ]);

    return {
      name: canonicalName,
      status: badgePath ? "downloaded" : "missing",
      badgePath,
      requestedApi: true,
    };
  } catch (error) {
    return {
      name: canonicalName,
      status: "failed",
      badgePath: null,
      message: error instanceof Error ? error.message : "Erro desconhecido",
      requestedApi: true,
    };
  }
}
