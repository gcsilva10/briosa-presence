import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getMatch,
  getMatchDetails,
  listAttendedMatches,
  listMatches,
  listSeasons,
  setAttendance,
} from "./database.ts";
import { syncCurrentSeason } from "./currentSeasonSync.ts";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const port = Number(process.env.PORT ?? 5173);
const isProduction = process.env.NODE_ENV === "production";
const configuredOrigins = new Set(
  (process.env.FRONTEND_URL ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean),
);

const applyCors = (request: IncomingMessage, response: ServerResponse) => {
  const origin = request.headers.origin?.replace(/\/$/, "");
  const isLocalOrigin = origin === "http://localhost:5173" || origin === "http://127.0.0.1:5173";
  if (origin && (configuredOrigins.has(origin) || isLocalOrigin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }
};

const json = (response: ServerResponse, body: unknown, status = 200) => {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(body));
};

const readJsonBody = async (request: IncomingMessage): Promise<unknown> => {
  let body = "";
  request.setEncoding("utf8");

  for await (const chunk of request) {
    body += chunk;
    if (body.length > 64_000) throw new Error("Pedido demasiado grande.");
  }

  return JSON.parse(body || "{}");
};

const handleApi = async (request: IncomingMessage, response: ServerResponse) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host}`);

  if (url.pathname === "/api/health") {
    json(response, { status: "ok" });
    return true;
  }

  if (url.pathname === "/api/seasons") {
    json(response, { seasons: listSeasons() });
    return true;
  }

  if (url.pathname === "/api/attendances") {
    if (request.method !== "GET") {
      json(response, { error: "Método não permitido." }, 405);
      return true;
    }
    json(response, { matches: listAttendedMatches() });
    return true;
  }

  const attendanceRoute = url.pathname.match(/^\/api\/matches\/([^/]+)\/attendance$/);
  if (attendanceRoute) {
    if (request.method !== "PUT") {
      json(response, { error: "Método não permitido." }, 405);
      return true;
    }

    try {
      const body = await readJsonBody(request) as { attended?: unknown };
      if (typeof body.attended !== "boolean") {
        json(response, { error: "O campo attended tem de ser booleano." }, 400);
        return true;
      }

      const matchId = decodeURIComponent(attendanceRoute[1]);
      const attended = setAttendance(matchId, body.attended);
      if (attended === null) {
        json(response, { error: "Jogo não encontrado." }, 404);
        return true;
      }

      json(response, { matchId, attended });
    } catch (error) {
      json(response, {
        error: error instanceof SyntaxError ? "JSON inválido." : "Não foi possível guardar a presença.",
      }, error instanceof SyntaxError ? 400 : 500);
    }
    return true;
  }

  const matchDetailRoute = url.pathname.match(/^\/api\/matches\/([^/]+)$/);
  if (matchDetailRoute) {
    if (request.method !== "GET") {
      json(response, { error: "Método não permitido." }, 405);
      return true;
    }
    const matchId = decodeURIComponent(matchDetailRoute[1]);
    const match = getMatch(matchId);
    if (!match) {
      json(response, { error: "Jogo não encontrado." }, 404);
      return true;
    }
    json(response, { match, ...getMatchDetails(matchId) });
    return true;
  }

  if (url.pathname === "/api/sync/current") {
    if (request.method !== "POST") {
      json(response, { error: "Método não permitido." }, 405);
      return true;
    }

    try {
      json(response, await syncCurrentSeason());
    } catch (error) {
      json(response, {
        error: error instanceof Error ? error.message : "Falha ao atualizar o calendário.",
      }, 502);
    }
    return true;
  }

  if (url.pathname === "/api/matches") {
    const season = url.searchParams.get("season");
    if (!season || !/^\d{4}-\d{4}$/.test(season)) {
      json(response, { error: "É necessária uma época válida." }, 400);
      return true;
    }
    json(response, { season, matches: listMatches(season) });
    return true;
  }

  if (url.pathname.startsWith("/api/")) {
    json(response, { error: "Rota não encontrada." }, 404);
    return true;
  }

  return false;
};

const serveStatic = (request: IncomingMessage, response: ServerResponse) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const distRoot = resolve(root, "dist");
  const publicRoot = resolve(root, "public");
  const distPath = resolve(distRoot, `.${requestedPath}`);
  const publicPath = resolve(publicRoot, `.${requestedPath}`);
  let filePath = distPath;

  if (!distPath.startsWith(distRoot) || !existsSync(distPath) || statSync(distPath).isDirectory()) {
    filePath = publicPath.startsWith(publicRoot) && existsSync(publicPath) && !statSync(publicPath).isDirectory()
      ? publicPath
      : resolve(distRoot, "index.html");
  }

  const mimeTypes: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".webp": "image/webp",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
  };

  response.writeHead(200, { "Content-Type": mimeTypes[extname(filePath)] ?? "application/octet-stream" });
  createReadStream(filePath).pipe(response);
};

const vite = isProduction
  ? null
  : await import("vite").then(({ createServer: createViteServer }) =>
      createViteServer({ server: { middlewareMode: true }, appType: "spa" }),
    );

const server = createServer(async (request, response) => {
  try {
    applyCors(request, response);
    if (request.method === "OPTIONS" && request.url?.startsWith("/api/")) {
      response.writeHead(204);
      response.end();
      return;
    }
    if (await handleApi(request, response)) return;
    if (vite) {
      vite.middlewares(request, response, () => {
        response.writeHead(404);
        response.end("Não encontrado");
      });
      return;
    }
    serveStatic(request, response);
  } catch (error) {
    console.error(error);
    if (!response.headersSent) json(response, { error: "Erro interno do servidor." }, 500);
    else response.end();
  }
});

server.listen(port, () => {
  console.log(`Briosa disponível em http://localhost:${port}`);
});
