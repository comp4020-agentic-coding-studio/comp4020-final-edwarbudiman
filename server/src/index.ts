import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { apiTokenInfo, changePassword, login, logout, makeApiToken, publicUser, requireUser, revokeApiToken, seedDemo, signup, updateMe } from "./auth.ts";
import { handleMcp } from "./agent.ts";
import { channelBoard, createArrow, createChannel, createNote, createSection, deleteArrow, deleteSection, updateSection, deleteNote, updateArrow, directory, forgetPerson, joinChannel, leaveChannel, listChannels, sidebar, stats, updateAccess, updateNote, userBoard } from "./boards.ts";
import { addComment, deleteComment, editComment, readSide, setProof, setStatus } from "./side.ts";
import { config } from "./config.ts";
import { openDb } from "./db.ts";
import { HttpError, readJson, sameOrigin, sendJson } from "./http.ts";
import { logAction, logEvent, recentActionCounts } from "./log.ts";
import { attachRealtime, liveStats, userChanged } from "./realtime.ts";
import { underPrefix } from "./routes.ts";
import { serveClient, serveReadme } from "./static.ts";
import { serveDocs } from "./docs.ts";
import { negotiate, notFound, serveMarkdownTwin, serveRobots, serveSitemap } from "./discovery.ts";

const db = openDb(config.dataDir);
await seedDemo(db);
const startedAt = Date.now();

type Handler = (req: IncomingMessage, res: ServerResponse, params: string[]) => Promise<void> | void;
const routes: { method: string; pattern: RegExp; handler: Handler }[] = [];
const route = (method: string, pattern: RegExp, handler: Handler) => routes.push({ method, pattern, handler });

// ---------------------------------------------------------------- accounts

route("POST", /^\/api\/signup$/, async (req, res) => signup(db, req, res, await readJson(req)));
route("POST", /^\/api\/login$/, async (req, res) => login(db, req, res, await readJson(req)));
route("POST", /^\/api\/logout$/, (req, res) => logout(db, req, res));
route("GET", /^\/api\/me$/, (req, res) => sendJson(res, 200, { user: publicUser(requireUser(db, req), true) }));
route("PATCH", /^\/api\/me$/, async (req, res) => {
  const user = updateMe(db, requireUser(db, req), await readJson(req));
  userChanged(user.id);
  sendJson(res, 200, { user: publicUser(user, true) });
});
// the token for the person's own agent (cookie session only; /mcp is where it's used)
route("GET", /^\/api\/me\/token$/, (req, res) => sendJson(res, 200, apiTokenInfo(db, requireUser(db, req).id)));
route("POST", /^\/api\/me\/token$/, (req, res) => {
  const user = requireUser(db, req);
  const token = makeApiToken(db, user.id);
  logAction(user.username, "settings.token.create");
  sendJson(res, 200, { token });
});
route("DELETE", /^\/api\/me\/token$/, (req, res) => {
  const user = requireUser(db, req);
  revokeApiToken(db, user.id);
  logAction(user.username, "settings.token.revoke");
  res.writeHead(204, { "cache-control": "no-store" }).end();
});
route("POST", /^\/api\/me\/password$/, async (req, res) => {
  const user = requireUser(db, req);
  await changePassword(db, req, res, user, await readJson(req));
});

// ---------------------------------------------------------------- boards and notes

route("GET", /^\/api\/users$/, (req, res) => {
  requireUser(db, req);
  sendJson(res, 200, { users: directory(db) });
});
route("GET", /^\/api\/boards\/user\/([^/]+)$/, (req, res, [name]) => sendJson(res, 200, userBoard(db, requireUser(db, req), decodeURIComponent(name))));
route("GET", /^\/api\/boards\/channel\/([^/]+)$/, (req, res, [slug]) => sendJson(res, 200, channelBoard(db, requireUser(db, req), decodeURIComponent(slug))));
route("POST", /^\/api\/boards\/(\d+)\/notes$/, async (req, res, [id]) => {
  const user = requireUser(db, req);
  sendJson(res, 201, { note: createNote(db, user, Number(id), await readJson(req)) });
});
route("PATCH", /^\/api\/notes\/(\d+)$/, async (req, res, [id]) => {
  const user = requireUser(db, req);
  sendJson(res, 200, { note: updateNote(db, user, Number(id), await readJson(req)) });
});
route("DELETE", /^\/api\/notes\/(\d+)$/, (req, res, [id]) => {
  deleteNote(db, requireUser(db, req), Number(id));
  sendJson(res, 200, { ok: true });
});

route("PUT", /^\/api\/notes\/(\d+)\/status$/, async (req, res, [id]) => {
  const user = requireUser(db, req);
  sendJson(res, 200, { note: setStatus(db, user, Number(id), await readJson(req)) });
});
route("PUT", /^\/api\/notes\/(\d+)\/proof$/, async (req, res, [id]) => {
  const user = requireUser(db, req);
  sendJson(res, 200, { note: setProof(db, user, Number(id), await readJson(req)) });
});
route("GET", /^\/api\/notes\/(\d+)\/side$/, (req, res, [id]) => sendJson(res, 200, readSide(db, requireUser(db, req), Number(id))));
route("POST", /^\/api\/notes\/(\d+)\/comments$/, async (req, res, [id]) => {
  const user = requireUser(db, req);
  sendJson(res, 201, { comment: addComment(db, user, Number(id), await readJson(req)) });
});
route("PATCH", /^\/api\/comments\/(\d+)$/, async (req, res, [id]) => {
  const user = requireUser(db, req);
  sendJson(res, 200, { comment: editComment(db, user, Number(id), await readJson(req)) });
});
route("DELETE", /^\/api\/comments\/(\d+)$/, (req, res, [id]) => {
  deleteComment(db, requireUser(db, req), Number(id));
  res.writeHead(204).end();
});

route("POST", /^\/api\/boards\/(\d+)\/arrows$/, async (req, res, [id]) => {
  const user = requireUser(db, req);
  const { arrow, created } = createArrow(db, user, Number(id), await readJson(req));
  sendJson(res, created ? 201 : 200, { arrow });
});
route("PATCH", /^\/api\/arrows\/(\d+)$/, async (req, res, [id]) => {
  const user = requireUser(db, req);
  sendJson(res, 200, { arrow: updateArrow(db, user, Number(id), await readJson(req)) });
});
route("DELETE", /^\/api\/arrows\/(\d+)$/, (req, res, [id]) => {
  deleteArrow(db, requireUser(db, req), Number(id));
  sendJson(res, 200, { ok: true });
});

route("POST", /^\/api\/boards\/(\d+)\/sections$/, async (req, res, [id]) => {
  const user = requireUser(db, req);
  sendJson(res, 201, { section: createSection(db, user, Number(id), await readJson(req)) });
});
route("PATCH", /^\/api\/sections\/(\d+)$/, async (req, res, [id]) => {
  const user = requireUser(db, req);
  sendJson(res, 200, { section: updateSection(db, user, Number(id), await readJson(req)) });
});
route("DELETE", /^\/api\/sections\/(\d+)$/, (req, res, [id]) => {
  deleteSection(db, requireUser(db, req), Number(id));
  res.writeHead(204, { "cache-control": "no-store" });
  res.end();
});

// ---------------------------------------------------------------- channels

route("GET", /^\/api\/channels$/, (req, res) => sendJson(res, 200, { channels: listChannels(db, requireUser(db, req)) }));
route("POST", /^\/api\/channels$/, async (req, res) => {
  const user = requireUser(db, req);
  sendJson(res, 201, { board: await createChannel(db, user, await readJson(req)) });
});
route("POST", /^\/api\/channels\/([^/]+)\/join$/, async (req, res, [slug]) => {
  const user = requireUser(db, req);
  sendJson(res, 200, { board: await joinChannel(db, user, decodeURIComponent(slug), await readJson(req)) });
});
route("PUT", /^\/api\/channels\/([^/]+)\/access$/, async (req, res, [slug]) => {
  const user = requireUser(db, req);
  sendJson(res, 200, { board: await updateAccess(db, user, decodeURIComponent(slug), await readJson(req)) });
});
route("POST", /^\/api\/channels\/([^/]+)\/leave$/, (req, res, [slug]) => {
  leaveChannel(db, requireUser(db, req), decodeURIComponent(slug));
  sendJson(res, 200, { ok: true });
});

// ---------------------------------------------------------------- sidebar

route("GET", /^\/api\/sidebar$/, (req, res) => sendJson(res, 200, sidebar(db, requireUser(db, req))));
route("DELETE", /^\/api\/sidebar\/people\/([^/]+)$/, (req, res, [name]) => {
  forgetPerson(db, requireUser(db, req), decodeURIComponent(name));
  sendJson(res, 200, { ok: true });
});

// ---------------------------------------------------------------- live view (C10-02)

route("GET", /^\/api\/stats$/, (req, res) => {
  requireUser(db, req);
  const mem = process.memoryUsage();
  sendJson(res, 200, {
    uptimeSec: Math.round((Date.now() - startedAt) / 1000),
    memoryMB: { rss: Math.round(mem.rss / 1e6), heap: Math.round(mem.heapUsed / 1e6) },
    db: stats(db),
    live: liveStats(),
    actionsLastHour: recentActionCounts(),
  });
});
route("GET", /^\/healthz$/, (_req, res) => sendJson(res, 200, { ok: true }));

// ---------------------------------------------------------------- dispatch

const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "same-origin",
  "x-frame-options": "DENY",
};

async function dispatch(req: IncomingMessage, res: ServerResponse): Promise<void> {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
  const path = new URL(req.url ?? "/", "http://x").pathname;
  const method = req.method ?? "GET";

  if (path.startsWith("/api/") || path === "/healthz") {
    // writes from another site are refused (SameSite=Lax cookies already
    // keep the session out of most of them)
    if (method !== "GET" && method !== "HEAD" && !sameOrigin(req)) throw new HttpError(403, "cross-site request refused");
    let pathMatched = false;
    for (const r of routes) {
      const m = path.match(r.pattern);
      if (!m) continue;
      pathMatched = true;
      if (r.method !== method) continue;
      await r.handler(req, res, m.slice(1));
      return;
    }
    throw new HttpError(pathMatched ? 405 : 404, pathMatched ? "method not allowed" : "no such endpoint");
  }
  // the agent endpoint: no Origin needed (agents aren't browsers), its own auth
  if (path === "/mcp") return handleMcp(db, req, res);
  if (method !== "GET" && method !== "HEAD") throw new HttpError(405, "method not allowed");
  // for agents (see routes.ts): each root file by name, never the SPA shell
  if (path === "/robots.txt") return serveRobots(req, res);
  if (path === "/sitemap.xml") return serveSitemap(req, res);
  if (path === "/index.md" || path === "/readme.md") return serveMarkdownTwin(req, res, path);
  if (underPrefix(path, ".well-known")) return notFound(req, res);
  if (underPrefix(path, "readme")) {
    if (await negotiate(req, res, path)) return;
    return serveReadme(req, res, path);
  }
  if (underPrefix(path, "docs")) {
    if (path.endsWith(".md")) return serveMarkdownTwin(req, res, path);
    if (await negotiate(req, res, path)) return;
    return serveDocs(req, res, path);
  }
  if (path === "/" && (await negotiate(req, res, path))) return;
  return serveClient(req, res, path);
}

const server = createServer((req, res) => {
  dispatch(req, res).catch((err: unknown) => {
    if (err instanceof HttpError) {
      if (!res.headersSent) sendJson(res, err.status, { error: err.message, ...err.extra });
      return;
    }
    logEvent("error", { message: err instanceof Error ? err.message : String(err), path: req.url });
    if (!res.headersSent) sendJson(res, 500, { error: "something went wrong on our side" });
    else res.end();
  });
});

attachRealtime(server, db);

server.listen(config.port, config.host, () => {
  logEvent("listening", { port: config.port, dataDir: config.dataDir });
});

for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, () => {
    logEvent("shutdown", { signal: sig });
    server.close();
    db.close();
    process.exit(0);
  });
}
