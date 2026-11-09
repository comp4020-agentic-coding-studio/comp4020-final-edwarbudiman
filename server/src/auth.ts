import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { promisify } from "node:util";
import { config } from "./config.ts";
import type { DB } from "./db.ts";
import { tx } from "./db.ts";
import { HttpError, clientIp, isHttps, parseCookies, sendJson, str } from "./http.ts";
import { logAction } from "./log.ts";
import { SERVER_DOT_DIRS, SERVER_FILES, SERVER_ENDPOINTS, SERVER_PAGES, SPA_PAGES } from "./routes.ts";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, keylen: number, opts: object) => Promise<Buffer>;

// ---------------------------------------------------------------- hashing

const N = 16384, R = 8, P = 1, KEYLEN = 32;

/** scrypt hash in the self-describing form scrypt$N$r$p$salt$hash. */
export async function hashSecret(secret: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(secret, salt, KEYLEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export async function verifySecret(secret: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, salt, hash] = stored.split("$");
  if (alg !== "scrypt") return false;
  const expected = Buffer.from(hash, "base64url");
  const actual = await scrypt(secret, Buffer.from(salt, "base64url"), expected.length, { N: Number(n), r: Number(r), p: Number(p) });
  return timingSafeEqual(expected, actual);
}

// A hash to verify against when the username doesn't exist, so a login for an
// unknown user takes as long as one with a wrong password.
let dummyHash: Promise<string> | null = null;

// ---------------------------------------------------------------- users

export interface User {
  id: number;
  username: string;
  email: string | null;
  is_demo: number;
  anonymous: number;
}

const USER_COLS = "id, username, email, is_demo, anonymous";

/** The only shape a user ever leaves the server in. Never pw_hash. */
export function publicUser(u: User, self = false) {
  return {
    id: u.id,
    username: u.username,
    anonymous: u.anonymous === 1,
    isDemo: u.is_demo === 1,
    ...(self ? { email: u.email } : {}),
  };
}

export const USERNAME_RE = /^[a-z0-9_-]{3,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// a user's board lives at /<username>, so these would collide with the app's own pages
export const RESERVED_USERNAMES = new Set<string>([...SPA_PAGES, ...SERVER_PAGES, ...SERVER_ENDPOINTS, ...SERVER_FILES, ...SERVER_DOT_DIRS, "logout", "assets", "admin", "help", "about", "new"]);

export function normaliseUsername(raw: unknown): string {
  if (typeof raw !== "string") throw new HttpError(400, "username is required");
  const username = raw.trim().toLowerCase();
  if (!USERNAME_RE.test(username)) {
    throw new HttpError(400, "username must be 3–20 characters: a–z, 0–9, _ or -");
  }
  return username;
}

function normaliseEmail(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw !== "string" || raw.length > 254 || !EMAIL_RE.test(raw.trim())) {
    throw new HttpError(400, "that email address doesn't look right");
  }
  return raw.trim().toLowerCase();
}

export function createUserBoard(db: DB, userId: number, username: string): void {
  db.prepare(
    "INSERT OR IGNORE INTO boards (kind, owner_id, slug, name, visibility, created_at) VALUES ('user', ?, ?, ?, 'public', ?)",
  ).run(userId, username, `${username}'s board`, Date.now());
  // your own board starts on your sidebar, caught up
  db.prepare("INSERT OR IGNORE INTO board_seen (board_id, user_id, seen_at) SELECT id, ?, ? FROM boards WHERE kind = 'user' AND slug = ?").run(userId, Date.now(), username);
}

// ---------------------------------------------------------------- sessions

const COOKIE = "sid";
const DAY = 24 * 60 * 60 * 1000;

const sha256 = (s: string): string => createHash("sha256").update(s).digest("hex");

function startSession(db: DB, req: IncomingMessage, userId: number): string {
  const token = randomBytes(32).toString("base64url");
  const expires = Date.now() + config.sessionDays * DAY;
  db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(sha256(token), userId, expires);
  return cookieHeader(req, token, config.sessionDays * 24 * 60 * 60);
}

function cookieHeader(req: IncomingMessage, value: string, maxAge: number): string {
  const secure = config.forceSecureCookie || isHttps(req) ? "; Secure" : "";
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

/** The logged-in user for a request (HTTP or WebSocket upgrade), or null. */
export function sessionUser(db: DB, req: IncomingMessage): User | null {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (!token) return null;
  const hash = sha256(token);
  const row = db
    .prepare(`SELECT s.expires_at, ${USER_COLS.split(", ").map((c) => "u." + c).join(", ")} FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`)
    .get(hash) as (User & { expires_at: number }) | undefined;
  if (!row) return null;
  const now = Date.now();
  if (row.expires_at < now) {
    db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hash);
    return null;
  }
  // Sliding expiry, so a session picked up the next day (or next week) still
  // works (F-04). The cookie's Max-Age is long enough to outlive the slide.
  if (row.expires_at - now < (config.sessionDays / 2) * DAY) {
    db.prepare("UPDATE sessions SET expires_at = ? WHERE token_hash = ?").run(now + config.sessionDays * DAY, hash);
  }
  const { expires_at: _, ...user } = row;
  return user;
}

export function requireUser(db: DB, req: IncomingMessage): User {
  const user = sessionUser(db, req);
  if (!user) throw new HttpError(401, "log in first");
  return user;
}

// ---------------------------------------------------------------- API tokens

// One token per user, for their own agent over /mcp. It acts as the person:
// the same User comes out, so every access rule applies unchanged.

const TOKEN_PREFIX = "pi_";
const TOUCH_EVERY_MS = 60_000;

export interface TokenInfo {
  exists: boolean;
  created_at: number | null;
  last_used_at: number | null;
}

/** Make the user's token, replacing any old one. The raw token is returned once and never stored. */
export function makeApiToken(db: DB, userId: number): string {
  const token = TOKEN_PREFIX + randomBytes(24).toString("base64url");
  db.prepare(
    "INSERT INTO api_tokens (user_id, token_hash, created_at, last_used_at) VALUES (?, ?, ?, NULL) ON CONFLICT (user_id) DO UPDATE SET token_hash = excluded.token_hash, created_at = excluded.created_at, last_used_at = NULL",
  ).run(userId, sha256(token), Date.now());
  return token;
}

export function revokeApiToken(db: DB, userId: number): void {
  db.prepare("DELETE FROM api_tokens WHERE user_id = ?").run(userId);
}

export function apiTokenInfo(db: DB, userId: number): TokenInfo {
  const row = db.prepare("SELECT created_at, last_used_at FROM api_tokens WHERE user_id = ?").get(userId) as { created_at: number; last_used_at: number | null } | undefined;
  return row ? { exists: true, created_at: row.created_at, last_used_at: row.last_used_at } : { exists: false, created_at: null, last_used_at: null };
}

/** The user a bearer token belongs to, or null. Notes the use at most once a minute. */
function tokenUser(db: DB, token: string): User | null {
  const hash = sha256(token);
  const row = db.prepare("SELECT user_id FROM api_tokens WHERE token_hash = ?").get(hash) as { user_id: number } | undefined;
  if (!row) return null;
  const now = Date.now();
  db.prepare("UPDATE api_tokens SET last_used_at = ? WHERE user_id = ? AND (last_used_at IS NULL OR last_used_at < ?)").run(now, row.user_id, now - TOUCH_EVERY_MS);
  return getUser(db, row.user_id) ?? null;
}

/**
 * For /mcp only: the user behind `Authorization: Bearer <token>`, else the
 * `sid` cookie. A bearer header that doesn't match a token fails outright,
 * it never falls back to a cookie. The /api routes keep using requireUser.
 */
export function requireUserAny(db: DB, req: IncomingMessage): User {
  const header = req.headers.authorization;
  if (header !== undefined) {
    const m = /^Bearer\s+(\S+)$/i.exec(header);
    const user = m ? tokenUser(db, m[1]) : null;
    if (!user) throw new HttpError(401, "missing, wrong or revoked token");
    return user;
  }
  return requireUser(db, req);
}

export function getUser(db: DB, id: number): User | undefined {
  return db.prepare(`SELECT ${USER_COLS} FROM users WHERE id = ?`).get(id) as User | undefined;
}

export function findUserByName(db: DB, username: string): User | undefined {
  return db.prepare(`SELECT ${USER_COLS} FROM users WHERE username = ?`).get(username) as User | undefined;
}

// ---------------------------------------------------------------- rate limits

/** Fixed-window counters held in memory; a restart resets them, which is fine. */
class Limiter {
  private hits = new Map<string, { count: number; until: number }>();
  private max: number;
  private windowMs: number;
  constructor(max: number, windowMs: number) {
    this.max = max;
    this.windowMs = windowMs;
  }
  blocked(key: string): boolean {
    const h = this.hits.get(key);
    return !!h && h.until > Date.now() && h.count >= this.max;
  }
  hit(key: string): void {
    const now = Date.now();
    const h = this.hits.get(key);
    if (!h || h.until <= now) this.hits.set(key, { count: 1, until: now + this.windowMs });
    else h.count++;
    if (this.hits.size > 10_000) for (const [k, v] of this.hits) if (v.until <= now) this.hits.delete(k);
  }
  clear(key: string): void {
    this.hits.delete(key);
  }
}

const loginFailures = new Limiter(10, 15 * 60 * 1000); // per ip+username
const loginFailuresIp = new Limiter(50, 15 * 60 * 1000); // per ip
const signups = new Limiter(config.signupsPerHourPerIp, 60 * 60 * 1000);

// ---------------------------------------------------------------- routes

export async function signup(db: DB, req: IncomingMessage, res: ServerResponse, body: Record<string, unknown>): Promise<void> {
  const ip = clientIp(req);
  if (signups.blocked(ip)) throw new HttpError(429, "too many sign-ups from here; try again later");
  const username = normaliseUsername(body.username);
  if (RESERVED_USERNAMES.has(username)) throw new HttpError(409, "that username is taken");
  const password = str(body, "password", { min: 8, max: 200 })!;
  const email = normaliseEmail(body.email);
  if (db.prepare("SELECT 1 FROM users WHERE username = ?").get(username)) {
    throw new HttpError(409, "that username is taken");
  }
  if (email && db.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) {
    throw new HttpError(409, "that email is already used by another account");
  }
  const pwHash = await hashSecret(password);
  signups.hit(ip);
  const user = tx(db, () => {
    const r = db
      .prepare("INSERT INTO users (username, email, pw_hash, created_at) VALUES (?, ?, ?, ?)")
      .run(username, email, pwHash, Date.now());
    const id = Number(r.lastInsertRowid);
    createUserBoard(db, id, username);
    return getUser(db, id)!;
  });
  logAction(username, "signup", { email: email !== null });
  sendJson(res, 201, { user: publicUser(user, true) }, { "set-cookie": startSession(db, req, user.id) });
}

export async function login(db: DB, req: IncomingMessage, res: ServerResponse, body: Record<string, unknown>): Promise<void> {
  const ip = clientIp(req);
  const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const key = `${ip}|${username}`;
  if (loginFailures.blocked(key) || loginFailuresIp.blocked(ip)) {
    throw new HttpError(429, "too many failed log-ins; wait a few minutes and try again");
  }
  const row = db.prepare("SELECT id, pw_hash FROM users WHERE username = ?").get(username) as { id: number; pw_hash: string } | undefined;
  dummyHash ??= hashSecret(randomBytes(16).toString("hex"));
  const ok = await verifySecret(password, row?.pw_hash ?? (await dummyHash));
  if (!row || !ok) {
    loginFailures.hit(key);
    loginFailuresIp.hit(ip);
    logAction(null, "login.fail");
    throw new HttpError(401, "wrong username or password");
  }
  loginFailures.clear(key);
  const user = getUser(db, row.id)!;
  logAction(user.username, "login");
  sendJson(res, 200, { user: publicUser(user, true) }, { "set-cookie": startSession(db, req, user.id) });
}

export function logout(db: DB, req: IncomingMessage, res: ServerResponse): void {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (token) {
    const row = db.prepare("SELECT u.username FROM sessions s JOIN users u ON u.id = s.user_id WHERE token_hash = ?").get(sha256(token)) as { username: string } | undefined;
    db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(token));
    if (row) logAction(row.username, "logout");
  }
  sendJson(res, 200, { ok: true }, { "set-cookie": cookieHeader(req, "", 0) });
}

export function updateMe(db: DB, user: User, body: Record<string, unknown>): User {
  if (body.anonymous !== undefined) {
    if (typeof body.anonymous !== "boolean") throw new HttpError(400, "anonymous must be true or false");
    db.prepare("UPDATE users SET anonymous = ? WHERE id = ?").run(body.anonymous ? 1 : 0, user.id);
    logAction(user.username, "settings.anonymous", { on: body.anonymous });
  }
  if (body.email !== undefined) {
    if (user.is_demo) throw new HttpError(403, "demo accounts can't be changed");
    const email = normaliseEmail(body.email);
    if (email && db.prepare("SELECT 1 FROM users WHERE email = ? AND id <> ?").get(email, user.id)) {
      throw new HttpError(409, "that email is already used by another account");
    }
    db.prepare("UPDATE users SET email = ? WHERE id = ?").run(email, user.id);
    logAction(user.username, "settings.email", { set: email !== null });
  }
  return getUser(db, user.id)!;
}

export async function changePassword(db: DB, req: IncomingMessage, res: ServerResponse, user: User, body: Record<string, unknown>): Promise<void> {
  if (user.is_demo) throw new HttpError(403, "demo accounts' passwords can't be changed");
  const current = str(body, "current", { max: 200 })!;
  const next = str(body, "password", { min: 8, max: 200 })!;
  const row = db.prepare("SELECT pw_hash FROM users WHERE id = ?").get(user.id) as { pw_hash: string };
  if (!(await verifySecret(current, row.pw_hash))) throw new HttpError(403, "current password is wrong");
  const hash = await hashSecret(next);
  // Every other session ends: a changed password should lock out whoever
  // else might have had it.
  tx(db, () => {
    db.prepare("UPDATE users SET pw_hash = ? WHERE id = ?").run(hash, user.id);
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(user.id);
    db.prepare("DELETE FROM api_tokens WHERE user_id = ?").run(user.id); // the agent's token goes with the old password
  });
  logAction(user.username, "settings.password");
  sendJson(res, 200, { ok: true }, { "set-cookie": startSession(db, req, user.id) });
}

// ---------------------------------------------------------------- demo seed

/** Seed demo1 / demo2 (idempotent) so markers have a way in. */
export async function seedDemo(db: DB): Promise<void> {
  for (const username of ["demo1", "demo2"]) {
    const existing = db.prepare("SELECT id, pw_hash FROM users WHERE username = ?").get(username) as { id: number; pw_hash: string } | undefined;
    if (existing) {
      // keep the documented password working even if DEMO_PASSWORD changed
      if (!(await verifySecret(config.demoPassword, existing.pw_hash))) {
        db.prepare("UPDATE users SET pw_hash = ?, is_demo = 1 WHERE id = ?").run(await hashSecret(config.demoPassword), existing.id);
      }
      createUserBoard(db, existing.id, username);
      continue;
    }
    const hash = await hashSecret(config.demoPassword);
    tx(db, () => {
      const r = db.prepare("INSERT INTO users (username, pw_hash, is_demo, created_at) VALUES (?, ?, 1, ?)").run(username, hash, Date.now());
      createUserBoard(db, Number(r.lastInsertRowid), username);
    });
  }
  // a shared channel so there's somewhere to meet out of the box
  const demo1 = findUserByName(db, "demo1")!;
  db.prepare(
    "INSERT OR IGNORE INTO boards (kind, owner_id, slug, name, visibility, description, created_at) VALUES ('channel', ?, 'lobby', 'Lobby', 'public', 'Say hi. Everyone starts here.', ?)",
  ).run(demo1.id, Date.now());
  // both demo accounts are in it, so their sidebars aren't empty
  const lobby = db.prepare("SELECT id FROM boards WHERE kind = 'channel' AND slug = 'lobby'").get() as { id: number };
  for (const username of ["demo1", "demo2"]) {
    const u = findUserByName(db, username)!;
    db.prepare("INSERT OR IGNORE INTO board_members (board_id, user_id) VALUES (?, ?)").run(lobby.id, u.id);
    db.prepare("INSERT OR IGNORE INTO board_seen (board_id, user_id, seen_at) VALUES (?, ?, ?)").run(lobby.id, u.id, Date.now());
  }
}
