import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { changePassword, login, logout, publicUser, requireUser, seedDemo, signup, updateMe } from "./auth.ts";
import { channelBoard, createChannel, createNote, deleteNote, directory, joinChannel, listChannels, stats, updateAccess, updateNote, userBoard } from "./boards.ts";
import { config } from "./config.ts";
import { openDb } from "./db.ts";
import { HttpError, readJson, sameOrigin, sendJson } from "./http.ts";
import { logEvent, recentActionCounts } from "./log.ts";
import { attachRealtime, liveStats, userChanged } from "./realtime.ts";
import { serveClient, serveReadme } from "./static.ts";

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
  sendJson(res, 200, { board: updateAccess(db, user, decodeURIComponent(slug), await readJson(req)) });
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
  if (method !== "GET" && method !== "HEAD") throw new HttpError(405, "method not allowed");
  if (path === "/readme" || path.startsWith("/readme/")) return serveReadme(req, res, path);
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
