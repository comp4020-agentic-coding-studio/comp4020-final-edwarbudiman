import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { join as joinPath } from "node:path";
import { WebSocket, WebSocketServer } from "ws";
import type { User } from "./auth.ts";
import { getUser, sessionUser } from "./auth.ts";
import type { Board, NoteRow } from "./boards.ts";
import { canEnter, canMove, canSee, getBoard, getNote, hooks, noteOut } from "./boards.ts";
import { config } from "./config.ts";
import type { DB } from "./db.ts";
import { sameOrigin } from "./http.ts";
import { logAction } from "./log.ts";

// One room per board. The server is authoritative for notes (they're written
// through the REST API and broadcast from here); presence, cursors and drag
// locks live only in this process's memory; chat isn't kept at all.

interface Client {
  sid: string;
  ws: WebSocket;
  user: User;
  board: Board | null;
  joinedAt: number;
  lastCursor: number;
  chatTimes: number[];
  alive: boolean;
}

interface Lock {
  sid: string;
  userId: number;
  boardId: number;
  timer: NodeJS.Timeout;
}

export interface ChatLine {
  id: string;
  author: string;
  ts: number;
  text: string;
  sig: string;
}

const LOCK_IDLE_MS = 10_000;
const HISTORY_TIMEOUT_MS = 2_000;
const HISTORY_CAP = 200;
const CHAT_MAX = 500;
const CURSOR_MIN_INTERVAL_MS = 40;

const rooms = new Map<number, Set<Client>>();
const clients = new Set<Client>();
const locks = new Map<number, Lock>();

let db: DB;
let chatKey: Buffer;

// ---------------------------------------------------------------- helpers

function send(c: Client, msg: unknown): void {
  if (c.ws.readyState === WebSocket.OPEN) c.ws.send(JSON.stringify(msg));
}

function room(boardId: number): Set<Client> {
  let r = rooms.get(boardId);
  if (!r) rooms.set(boardId, (r = new Set()));
  return r;
}

const displayName = (u: User): string | null => (u.anonymous ? null : u.username);

/** Send to everyone in the board's room who may see this note. */
function toViewers(board: Board, note: NoteRow, msg: (c: Client) => unknown, except?: Client): void {
  for (const c of rooms.get(board.id) ?? []) {
    if (c !== except && canSee(board, note, c.user.id)) send(c, msg(c));
  }
}

function presence(boardId: number): void {
  const r = rooms.get(boardId);
  if (!r) return;
  const named = new Set<string>();
  const anonUsers = new Set<number>();
  for (const c of r) {
    if (c.user.anonymous) anonUsers.add(c.user.id);
    else named.add(c.user.username);
  }
  // peers: one entry per open connection, so a page can tell whose cursor is whose (and follow it)
  const peers = [...r].map((c) => ({ sid: c.sid, name: displayName(c.user) }));
  const msg = { type: "presence", users: [...named].sort(), anon: anonUsers.size, peers };
  for (const c of r) send(c, msg);
}

// ---------------------------------------------------------------- locks

function lockMsg(noteId: number, lock: Lock | undefined, to: Client) {
  if (!lock) return { type: "lock", id: noteId, holder: null, mine: false };
  const holder = getHolderName(lock);
  return { type: "lock", id: noteId, holder, mine: lock.sid === to.sid };
}

function getHolderName(lock: Lock): string {
  for (const c of clients) if (c.sid === lock.sid) return displayName(c.user) ?? "someone";
  return "someone";
}

function broadcastLock(noteId: number): void {
  const lock = locks.get(noteId);
  const note = getNote(db, noteId);
  const board = note && getBoard(db, note.board_id);
  if (!note || !board) return;
  toViewers(board, note, (c) => lockMsg(noteId, lock, c));
}

function releaseLock(noteId: number, reason: string): void {
  const lock = locks.get(noteId);
  if (!lock) return;
  clearTimeout(lock.timer);
  locks.delete(noteId);
  logAction(null, "lock.release", { note: noteId, reason });
  broadcastLock(noteId);
}

function armIdle(noteId: number, lock: Lock): void {
  clearTimeout(lock.timer);
  lock.timer = setTimeout(() => releaseLock(noteId, "idle"), LOCK_IDLE_MS);
}

// ---------------------------------------------------------------- chat

function chatSecret(): Buffer {
  if (process.env.CHAT_SECRET) return Buffer.from(process.env.CHAT_SECRET);
  // Kept on the volume so lines signed before a restart still verify after it.
  // This is a signing key, not chat: no message is ever written anywhere.
  const file = joinPath(config.dataDir, "chat-hmac.key");
  if (existsSync(file)) return readFileSync(file);
  const key = randomBytes(32);
  writeFileSync(file, key, { mode: 0o600 });
  return key;
}

function sign(boardId: number, l: Omit<ChatLine, "sig">): string {
  return createHmac("sha256", chatKey).update(JSON.stringify([boardId, l.id, l.author, l.ts, l.text])).digest("base64url");
}

export function verifyLine(boardId: number, raw: unknown): ChatLine | null {
  if (typeof raw !== "object" || raw === null) return null;
  const l = raw as Record<string, unknown>;
  if (typeof l.id !== "string" || typeof l.author !== "string" || typeof l.ts !== "number" || typeof l.text !== "string" || typeof l.sig !== "string") return null;
  if (l.text.length > CHAT_MAX || l.id.length > 64 || l.author.length > 20) return null;
  const line = { id: l.id, author: l.author, ts: l.ts, text: l.text };
  const expected = Buffer.from(sign(boardId, line));
  const actual = Buffer.from(l.sig);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  return { ...line, sig: l.sig };
}

function chatSend(c: Client, text: unknown): void {
  const board = c.board;
  if (!board || board.kind !== "channel") return;
  if (typeof text !== "string" || !text.trim() || text.length > CHAT_MAX) return;
  const now = Date.now();
  c.chatTimes = c.chatTimes.filter((t) => t > now - 5000);
  if (c.chatTimes.length >= 10) return send(c, { type: "error", message: "slow down a little" });
  c.chatTimes.push(now);
  const unsigned = { id: randomBytes(9).toString("base64url"), author: c.user.username, ts: now, text: text.trim() };
  const line: ChatLine = { ...unsigned, sig: sign(board.id, unsigned) };
  logAction(c.user.username, "chat.send", { board: board.id }); // never the text
  for (const peer of rooms.get(board.id) ?? []) send(peer, { type: "chat:msg", line });
  // ...and it's gone: nothing here keeps it.
}

/** Pending history handoffs, keyed by request id. Holds no chat, only who's being asked. */
const handoffs = new Map<string, { newcomer: Client; asked: Client; queue: Client[]; timer: NodeJS.Timeout }>();

function startHandoff(newcomer: Client): void {
  const board = newcomer.board!;
  // longest-present peers first: they've seen the most
  const queue = [...(rooms.get(board.id) ?? [])].filter((c) => c !== newcomer).sort((a, b) => a.joinedAt - b.joinedAt);
  askNext(newcomer, queue);
}

function askNext(newcomer: Client, queue: Client[]): void {
  const board = newcomer.board;
  let peer: Client | undefined;
  while ((peer = queue.shift())) {
    if (peer.ws.readyState === WebSocket.OPEN && peer.board?.id === board?.id) break;
  }
  if (!peer || !board || newcomer.board?.id !== board.id) {
    send(newcomer, { type: "chat:history", lines: [] });
    return;
  }
  const to = randomBytes(9).toString("base64url");
  const timer = setTimeout(() => {
    handoffs.delete(to);
    askNext(newcomer, queue);
  }, HISTORY_TIMEOUT_MS);
  handoffs.set(to, { newcomer, asked: peer, queue, timer });
  send(peer, { type: "chat:history:request", to });
}

function historyReply(c: Client, msg: Record<string, unknown>): void {
  const to = typeof msg.to === "string" ? msg.to : "";
  const h = handoffs.get(to);
  if (!h || h.asked !== c) return; // only the peer that was asked may answer
  clearTimeout(h.timer);
  handoffs.delete(to);
  const board = h.newcomer.board;
  if (!board || h.newcomer.ws.readyState !== WebSocket.OPEN) return;
  // F-01: a peer can decline to share what it holds; ask the next one
  if (msg.declined === true || !Array.isArray(msg.lines)) return askNext(h.newcomer, h.queue);
  const seen = new Set<string>();
  const lines: ChatLine[] = [];
  let dropped = 0;
  for (const raw of msg.lines.slice(-HISTORY_CAP * 2)) {
    const line = verifyLine(board.id, raw);
    if (!line) {
      dropped++;
      continue;
    }
    if (seen.has(line.id)) continue;
    seen.add(line.id);
    lines.push(line);
  }
  lines.sort((a, b) => a.ts - b.ts);
  if (dropped) logAction(c.user.username, "chat.history.forged", { board: board.id, dropped });
  send(h.newcomer, { type: "chat:history", lines: lines.slice(-HISTORY_CAP) });
}

// ---------------------------------------------------------------- rooms

function leave(c: Client): void {
  const board = c.board;
  if (!board) return;
  rooms.get(board.id)?.delete(c);
  if (rooms.get(board.id)?.size === 0) rooms.delete(board.id);
  for (const [noteId, lock] of locks) if (lock.sid === c.sid) releaseLock(noteId, "left");
  for (const peer of rooms.get(board.id) ?? []) send(peer, { type: "cursor:leave", sid: c.sid });
  // a handoff in flight to this newcomer is moot; one asked of this peer moves on
  for (const [to, h] of handoffs) {
    if (h.newcomer === c) {
      clearTimeout(h.timer);
      handoffs.delete(to);
    } else if (h.asked === c) {
      clearTimeout(h.timer);
      handoffs.delete(to);
      askNext(h.newcomer, h.queue);
    }
  }
  c.board = null;
  presence(board.id);
}

function join(c: Client, boardId: unknown): void {
  const user = typeof boardId === "number" ? getUser(db, c.user.id) : undefined;
  const board = user && getBoard(db, boardId as number);
  if (!user || !board || !canEnter(db, board, user)) {
    send(c, { type: "error", code: "forbidden", message: "you can't join that board" });
    return;
  }
  leave(c);
  c.user = user;
  c.board = board;
  c.joinedAt = Date.now();
  room(board.id).add(c);
  logAction(user.username, "board.enter", { board: board.id, kind: board.kind });
  send(c, { type: "joined", board: board.id, sid: c.sid });
  presence(board.id);
  for (const [noteId, lock] of locks) {
    if (lock.boardId !== board.id) continue;
    const note = getNote(db, noteId);
    if (note && canSee(board, note, user.id)) send(c, lockMsg(noteId, lock, c));
  }
  if (board.kind === "channel") startHandoff(c);
}

function handle(c: Client, msg: Record<string, unknown>): void {
  if (msg.type === "join") return join(c, msg.board);
  if (msg.type === "ping") return send(c, { type: "pong" });
  const board = c.board;
  if (!board) return;

  switch (msg.type) {
    case "cursor": {
      const now = Date.now();
      if (now - c.lastCursor < CURSOR_MIN_INTERVAL_MS) return;
      if (typeof msg.x !== "number" || typeof msg.y !== "number" || !Number.isFinite(msg.x) || !Number.isFinite(msg.y)) return;
      c.lastCursor = now;
      const out = { type: "cursor", sid: c.sid, name: displayName(c.user), x: msg.x, y: msg.y };
      for (const peer of rooms.get(board.id) ?? []) if (peer !== c) send(peer, out);
      return;
    }
    case "lock:acquire": {
      const note = typeof msg.id === "number" ? getNote(db, msg.id) : undefined;
      if (!note || note.board_id !== board.id || !canSee(board, note, c.user.id) || !canMove(board, note, c.user.id)) {
        return send(c, { type: "lock:denied", id: msg.id, holder: null });
      }
      const held = locks.get(note.id);
      if (held && held.sid !== c.sid) {
        // first holder wins
        return send(c, { type: "lock:denied", id: note.id, holder: getHolderName(held) });
      }
      const lock = held ?? { sid: c.sid, userId: c.user.id, boardId: board.id, timer: setTimeout(() => {}, 0) };
      locks.set(note.id, lock);
      armIdle(note.id, lock);
      if (!held) logAction(c.user.username, "lock.acquire", { board: board.id, note: note.id });
      broadcastLock(note.id);
      return;
    }
    case "lock:release": {
      const lock = typeof msg.id === "number" ? locks.get(msg.id) : undefined;
      if (lock && lock.sid === c.sid) releaseLock(msg.id as number, "drop");
      return;
    }
    case "note:move": {
      // live position while dragging; the drop is saved through the REST API
      const id = msg.id;
      const lock = typeof id === "number" ? locks.get(id) : undefined;
      if (!lock || lock.sid !== c.sid) return send(c, { type: "lock:denied", id, holder: lock ? getHolderName(lock) : null });
      if (typeof msg.x !== "number" || typeof msg.y !== "number" || !Number.isFinite(msg.x) || !Number.isFinite(msg.y)) return;
      armIdle(id as number, lock);
      const note = getNote(db, id as number);
      if (note) toViewers(board, note, () => ({ type: "note:move", id, x: msg.x, y: msg.y }), c);
      return;
    }
    case "chat:send":
      return chatSend(c, msg.text);
    case "chat:history:reply":
      return historyReply(c, msg);
  }
}

// ---------------------------------------------------------------- wiring

export function attachRealtime(server: Server, database: DB): void {
  db = database;
  chatKey = chatSecret();
  const wss = new WebSocketServer({ noServer: true, maxPayload: 512 * 1024 });

  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const path = (req.url ?? "").split("?")[0];
    const reject = (code: number, why: string) => {
      socket.write(`HTTP/1.1 ${code} ${why}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
      socket.destroy();
    };
    if (path !== "/ws") return reject(404, "Not Found");
    // a page on another site can't open a socket with our user's cookie
    if (!req.headers.origin || !sameOrigin(req)) return reject(403, "Forbidden");
    const user = sessionUser(db, req);
    if (!user) return reject(401, "Unauthorized");
    wss.handleUpgrade(req, socket, head, (ws) => {
      const c: Client = { sid: randomBytes(6).toString("base64url"), ws, user, board: null, joinedAt: 0, lastCursor: 0, chatTimes: [], alive: true };
      clients.add(c);
      ws.on("pong", () => (c.alive = true));
      ws.on("message", (data) => {
        let msg: unknown;
        try {
          msg = JSON.parse(String(data));
        } catch {
          return;
        }
        if (typeof msg === "object" && msg !== null) handle(c, msg as Record<string, unknown>);
      });
      ws.on("close", () => {
        leave(c);
        clients.delete(c);
      });
      send(c, { type: "hello", sid: c.sid, user: user.username });
    });
  });

  // drop sockets that stop answering (a phone that went to sleep, say)
  setInterval(() => {
    for (const c of clients) {
      if (!c.alive) {
        c.ws.terminate();
        continue;
      }
      c.alive = false;
      c.ws.ping();
    }
  }, 30_000).unref();

  hooks.noteUpserted = (board, note) => {
    for (const c of rooms.get(board.id) ?? []) {
      // a note that just turned private disappears for those who can't see it
      if (canSee(board, note, c.user.id)) send(c, { type: "note:upsert", note: noteOut(board, note, c.user.id) });
      else send(c, { type: "note:delete", id: note.id });
    }
  };
  hooks.noteDeleted = (board, note) => {
    const lock = locks.get(note.id);
    if (lock) {
      clearTimeout(lock.timer);
      locks.delete(note.id);
    }
    toViewers(board, note, () => ({ type: "note:delete", id: note.id }));
  };
  hooks.lockHolder = (noteId) => locks.get(noteId)?.userId ?? null;
}

/** A user's settings changed (the anonymous toggle): refresh their live presence. */
export function userChanged(userId: number): void {
  const user = getUser(db, userId);
  if (!user) return;
  const boards = new Set<number>();
  for (const c of clients) {
    if (c.user.id !== userId) continue;
    c.user = user;
    if (c.board) boards.add(c.board.id);
  }
  for (const b of boards) presence(b);
}

export function liveStats() {
  return { sockets: clients.size, rooms: rooms.size, locks: locks.size, handoffsInFlight: handoffs.size };
}
