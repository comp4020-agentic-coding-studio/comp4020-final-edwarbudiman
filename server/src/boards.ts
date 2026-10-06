import type { DB } from "./db.ts";
import { tx } from "./db.ts";
import type { User } from "./auth.ts";
import { hashSecret, normaliseUsername, verifySecret } from "./auth.ts";
import { HttpError, num, str } from "./http.ts";
import { logAction } from "./log.ts";

// ---------------------------------------------------------------- types

export interface Board {
  id: number;
  kind: "user" | "channel";
  owner_id: number | null;
  owner_name: string | null;
  slug: string;
  name: string;
  visibility: "public" | "key" | "list";
  key_hash: string | null;
  created_at: number;
}

export interface NoteRow {
  id: number;
  board_id: number;
  author_id: number;
  author: string;
  text: string;
  color: string;
  x: number;
  y: number;
  z: number;
  visibility: "public" | "private";
  labels: string; // JSON array
  version: number;
  created_at: number;
  updated_at: number;
}

export const COLORS = ["yellow", "pink", "blue", "green", "orange", "purple"] as const;
export const NOTE_MAX = 280;
export const LABEL_MAX = 24;
export const LABELS_PER_NOTE = 5;

/**
 * Wired up by the real-time layer (realtime.ts): REST writes are broadcast to
 * the board's room after they commit, and moves respect the drag lock.
 */
export const hooks = {
  noteUpserted: (_board: Board, _note: NoteRow): void => {},
  noteDeleted: (_board: Board, _note: NoteRow): void => {},
  lockHolder: (_noteId: number): number | null => null,
};

const BOARD_COLS = "b.id, b.kind, b.owner_id, u.username AS owner_name, b.slug, b.name, b.visibility, b.key_hash, b.created_at";
const NOTE_COLS = "n.id, n.board_id, n.author_id, u.username AS author, n.text, n.color, n.x, n.y, n.z, n.visibility, n.labels, n.version, n.created_at, n.updated_at";

export function getBoard(db: DB, id: number): Board | undefined {
  return db.prepare(`SELECT ${BOARD_COLS} FROM boards b LEFT JOIN users u ON u.id = b.owner_id WHERE b.id = ?`).get(id) as Board | undefined;
}

function boardBySlug(db: DB, kind: "user" | "channel", slug: string): Board | undefined {
  return db.prepare(`SELECT ${BOARD_COLS} FROM boards b LEFT JOIN users u ON u.id = b.owner_id WHERE b.kind = ? AND b.slug = ?`).get(kind, slug) as Board | undefined;
}

export function getNote(db: DB, id: number): NoteRow | undefined {
  return db.prepare(`SELECT ${NOTE_COLS} FROM notes n JOIN users u ON u.id = n.author_id WHERE n.id = ?`).get(id) as NoteRow | undefined;
}

// ---------------------------------------------------------------- access rules

export function isMember(db: DB, boardId: number, userId: number): boolean {
  return !!db.prepare("SELECT 1 FROM board_members WHERE board_id = ? AND user_id = ?").get(boardId, userId);
}

/** Can this user be in the board at all (see it, join its room)? */
export function canEnter(db: DB, board: Board, user: User): boolean {
  // every logged-in user can visit every user board; channels need membership
  return board.kind === "user" || isMember(db, board.id, user.id);
}

/**
 * Private notes (user boards only): seen by their author and the board's
 * owner, nobody else. This is the one place that rule lives; the REST reads
 * and the WebSocket broadcasts both go through it.
 */
export function canSee(board: Board, note: NoteRow, userId: number): boolean {
  return note.visibility === "public" || note.author_id === userId || board.owner_id === userId;
}

/** Edit text / colour / visibility. Channel: any member. User board: own notes. */
export function canEdit(board: Board, note: NoteRow, userId: number): boolean {
  return board.kind === "channel" || note.author_id === userId;
}

/** Move / delete. Channel: any member. User board: owner any, visitor own. */
export function canMove(board: Board, note: NoteRow, userId: number): boolean {
  return board.kind === "channel" || note.author_id === userId || board.owner_id === userId;
}

export function noteOut(board: Board, note: NoteRow, userId: number) {
  return {
    id: note.id,
    boardId: note.board_id,
    author: note.author,
    text: note.text,
    color: note.color,
    x: note.x,
    y: note.y,
    z: note.z,
    visibility: note.visibility,
    labels: readLabels(note.labels),
    version: note.version,
    createdAt: note.created_at,
    updatedAt: note.updated_at,
    canEdit: canEdit(board, note, userId),
    canMove: canMove(board, note, userId),
  };
}

function readLabels(raw: string): string[] {
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? v.filter((l): l is string => typeof l === "string") : [];
  } catch {
    return [];
  }
}

export function boardOut(db: DB, board: Board, user: User) {
  const isOwner = board.owner_id === user.id;
  return {
    id: board.id,
    kind: board.kind,
    slug: board.slug,
    name: board.name,
    owner: board.owner_name,
    isOwner,
    visibility: board.visibility,
    // the key itself is never stored in the clear, nor its hash ever sent
    ...(board.kind === "channel" && isOwner ? { access: accessLists(db, board.id) } : {}),
  };
}

function listNotes(db: DB, board: Board, user: User) {
  const rows = db.prepare(`SELECT ${NOTE_COLS} FROM notes n JOIN users u ON u.id = n.author_id WHERE n.board_id = ? ORDER BY n.z`).all(board.id) as unknown as NoteRow[];
  return rows.filter((n) => canSee(board, n, user.id)).map((n) => noteOut(board, n, user.id));
}

// ---------------------------------------------------------------- reads

export function userBoard(db: DB, user: User, username: string) {
  const board = boardBySlug(db, "user", username.toLowerCase());
  if (!board) throw new HttpError(404, "no such user");
  return { board: boardOut(db, board, user), notes: listNotes(db, board, user) };
}

export function channelBoard(db: DB, user: User, slug: string) {
  const board = boardBySlug(db, "channel", slug.toLowerCase());
  if (!board) throw new HttpError(404, "no such channel");
  if (!isMember(db, board.id, user.id)) {
    // a public channel you're allowed into: walking in makes you a member
    if (board.visibility === "public" && !denied(db, board.id, user.username)) {
      join(db, board, user);
    } else {
      throw new HttpError(403, "you're not a member of this channel", { needsKey: board.visibility === "key", visibility: board.visibility });
    }
  }
  return { board: boardOut(db, board, user), notes: listNotes(db, board, user) };
}

export function directory(db: DB) {
  return db.prepare("SELECT username FROM users ORDER BY username").all() as { username: string }[];
}

export function listChannels(db: DB, user: User) {
  const rows = db
    .prepare(
      `SELECT b.slug, b.name, b.visibility, u.username AS owner,
              EXISTS (SELECT 1 FROM board_members m WHERE m.board_id = b.id AND m.user_id = ?) AS member,
              (SELECT COUNT(*) FROM board_members m WHERE m.board_id = b.id) AS members
       FROM boards b LEFT JOIN users u ON u.id = b.owner_id
       WHERE b.kind = 'channel' ORDER BY b.name COLLATE NOCASE`,
    )
    .all(user.id) as { slug: string; name: string; visibility: string; owner: string; member: number; members: number }[];
  return rows.map((r) => ({ ...r, member: r.member === 1 }));
}

// ---------------------------------------------------------------- notes

function boardForWrite(db: DB, boardId: number, user: User): Board {
  const board = getBoard(db, boardId);
  if (!board || !canEnter(db, board, user)) throw new HttpError(404, "no such board");
  return board;
}

function parseColor(v: unknown): string {
  if (typeof v !== "string" || !(COLORS as readonly string[]).includes(v)) {
    throw new HttpError(400, `color must be one of ${COLORS.join(", ")}`);
  }
  return v;
}

/** Trimmed, de-duplicated ignoring case, stored as a JSON array. */
function parseLabels(v: unknown): string {
  if (!Array.isArray(v) || v.length > 50) throw new HttpError(400, `labels must be a list of up to ${LABELS_PER_NOTE} labels`);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of v) {
    if (typeof raw !== "string") throw new HttpError(400, "each label must be text");
    const label = raw.trim().replace(/\s+/g, " ");
    if (!label) continue;
    if (label.length > LABEL_MAX) throw new HttpError(400, `a label can be at most ${LABEL_MAX} characters`);
    if (/[\u0000-\u001f\u007f]/.test(label)) throw new HttpError(400, "labels can't contain control characters");
    if (seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    out.push(label);
  }
  if (out.length > LABELS_PER_NOTE) throw new HttpError(400, `a note can have at most ${LABELS_PER_NOTE} labels`);
  return JSON.stringify(out);
}

function parseVisibility(board: Board, v: unknown): "public" | "private" {
  if (v !== "public" && v !== "private") throw new HttpError(400, "visibility must be public or private");
  if (board.kind === "channel" && v === "private") throw new HttpError(400, "channel notes are all public");
  return v;
}

export function createNote(db: DB, user: User, boardId: number, body: Record<string, unknown>) {
  const board = boardForWrite(db, boardId, user);
  const text = str(body, "text", { min: 0, max: NOTE_MAX }) ?? "";
  const color = body.color === undefined ? "yellow" : parseColor(body.color);
  const visibility = body.visibility === undefined ? "public" : parseVisibility(board, body.visibility);
  const labels = body.labels === undefined ? "[]" : parseLabels(body.labels);
  const x = num(body, "x", true) ?? 0;
  const y = num(body, "y", true) ?? 0;
  const now = Date.now();
  const id = tx(db, () => {
    const { z } = db.prepare("SELECT COALESCE(MAX(z), 0) + 1 AS z FROM notes WHERE board_id = ?").get(board.id) as { z: number };
    const r = db
      .prepare("INSERT INTO notes (board_id, author_id, text, color, x, y, z, visibility, labels, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(board.id, user.id, text, color, x, y, z, visibility, labels, now, now);
    return Number(r.lastInsertRowid);
  });
  const note = getNote(db, id)!;
  logAction(user.username, "note.create", { board: board.id, note: id, visibility, color });
  hooks.noteUpserted(board, note);
  return noteOut(board, note, user.id);
}

function noteForWrite(db: DB, user: User, noteId: number): { board: Board; note: NoteRow } {
  const note = getNote(db, noteId);
  const board = note && getBoard(db, note.board_id);
  // a note you can't see is a note that doesn't exist, as far as you know
  if (!note || !board || !canEnter(db, board, user) || !canSee(board, note, user.id)) {
    throw new HttpError(404, "no such note");
  }
  return { board, note };
}

export function updateNote(db: DB, user: User, noteId: number, body: Record<string, unknown>) {
  const { board, note } = noteForWrite(db, user, noteId);
  const sets: string[] = [];
  const args: (string | number)[] = [];
  const changed: string[] = [];

  const content = body.text !== undefined || body.color !== undefined || body.visibility !== undefined || body.labels !== undefined;
  if (content && !canEdit(board, note, user.id)) throw new HttpError(403, "you can only edit your own notes here");
  if (body.text !== undefined) {
    sets.push("text = ?");
    args.push(str(body, "text", { min: 0, max: NOTE_MAX }) ?? "");
    changed.push("text");
  }
  if (body.color !== undefined) {
    sets.push("color = ?");
    args.push(parseColor(body.color));
    changed.push("color");
  }
  if (body.visibility !== undefined) {
    sets.push("visibility = ?");
    args.push(parseVisibility(board, body.visibility));
    changed.push("visibility");
  }
  if (body.labels !== undefined) {
    sets.push("labels = ?");
    args.push(parseLabels(body.labels));
    changed.push("labels");
  }

  const moving = body.x !== undefined || body.y !== undefined || body.front === true;
  if (moving) {
    if (!canMove(board, note, user.id)) throw new HttpError(403, "you can only move your own notes here");
    const holder = hooks.lockHolder(note.id);
    if (holder !== null && holder !== user.id) throw new HttpError(409, "someone else is holding that note");
    if (body.x !== undefined) {
      sets.push("x = ?");
      args.push(num(body, "x")!);
    }
    if (body.y !== undefined) {
      sets.push("y = ?");
      args.push(num(body, "y")!);
    }
    if (body.front === true) {
      sets.push("z = (SELECT COALESCE(MAX(z), 0) + 1 FROM notes WHERE board_id = ?)");
      args.push(board.id);
    }
    changed.push("position");
  }
  if (sets.length === 0) throw new HttpError(400, "nothing to change");

  sets.push("version = version + 1", "updated_at = ?");
  args.push(Date.now());
  db.prepare(`UPDATE notes SET ${sets.join(", ")} WHERE id = ?`).run(...args, note.id);
  const updated = getNote(db, note.id)!;
  logAction(user.username, changed.includes("position") && changed.length === 1 ? "note.move" : "note.update", {
    board: board.id,
    note: note.id,
    fields: changed.join(","),
  });
  hooks.noteUpserted(board, updated);
  return noteOut(board, updated, user.id);
}

export function deleteNote(db: DB, user: User, noteId: number): void {
  const { board, note } = noteForWrite(db, user, noteId);
  if (!canMove(board, note, user.id)) throw new HttpError(403, "you can only delete your own notes here");
  const holder = hooks.lockHolder(note.id);
  if (holder !== null && holder !== user.id) throw new HttpError(409, "someone else is holding that note");
  db.prepare("DELETE FROM notes WHERE id = ?").run(note.id);
  logAction(user.username, "note.delete", { board: board.id, note: note.id });
  hooks.noteDeleted(board, note);
}

// ---------------------------------------------------------------- channels

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,31}$/;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

function usernameList(v: unknown, key: string): string[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.length > 200) throw new HttpError(400, `${key} must be a list of usernames`);
  return [...new Set(v.map((u) => normaliseUsername(u)))];
}

function denied(db: DB, boardId: number, username: string): boolean {
  return !!db.prepare("SELECT 1 FROM board_access WHERE board_id = ? AND username = ? AND rule = 'deny'").get(boardId, username);
}

function allowed(db: DB, boardId: number, username: string): boolean {
  return !!db.prepare("SELECT 1 FROM board_access WHERE board_id = ? AND username = ? AND rule = 'allow'").get(boardId, username);
}

function accessLists(db: DB, boardId: number) {
  const rows = db.prepare("SELECT username, rule FROM board_access WHERE board_id = ? ORDER BY username").all(boardId) as { username: string; rule: string }[];
  return {
    allow: rows.filter((r) => r.rule === "allow").map((r) => r.username),
    deny: rows.filter((r) => r.rule === "deny").map((r) => r.username),
  };
}

function setAccess(db: DB, boardId: number, allow: string[], deny: string[]): void {
  db.prepare("DELETE FROM board_access WHERE board_id = ?").run(boardId);
  const ins = db.prepare("INSERT OR REPLACE INTO board_access (board_id, username, rule) VALUES (?, ?, ?)");
  for (const u of allow) ins.run(boardId, u, "allow");
  for (const u of deny) ins.run(boardId, u, "deny"); // deny wins over allow
  // anyone now denied loses their membership
  db.prepare(
    "DELETE FROM board_members WHERE board_id = ? AND user_id IN (SELECT u.id FROM users u JOIN board_access a ON a.username = u.username WHERE a.board_id = ? AND a.rule = 'deny') AND user_id <> (SELECT owner_id FROM boards WHERE id = ?)",
  ).run(boardId, boardId, boardId);
}

export async function createChannel(db: DB, user: User, body: Record<string, unknown>) {
  const name = str(body, "name", { min: 1, max: 40 })!.trim();
  if (!name) throw new HttpError(400, "name is required");
  const slug = typeof body.slug === "string" && body.slug ? body.slug.toLowerCase() : slugify(name);
  if (!SLUG_RE.test(slug)) throw new HttpError(400, "the channel's address must be 2–32 characters: a–z, 0–9 or -");
  const visibility = body.visibility ?? "public";
  if (visibility !== "public" && visibility !== "key" && visibility !== "list") {
    throw new HttpError(400, "visibility must be public, key or list");
  }
  let keyHash: string | null = null;
  if (visibility === "key") keyHash = await hashSecret(str(body, "key", { min: 4, max: 100 })!);
  const allow = usernameList(body.allow, "allow");
  const deny = usernameList(body.deny, "deny");
  if (boardBySlug(db, "channel", slug)) throw new HttpError(409, "a channel with that address already exists");
  const id = tx(db, () => {
    const r = db
      .prepare("INSERT INTO boards (kind, owner_id, slug, name, visibility, key_hash, created_at) VALUES ('channel', ?, ?, ?, ?, ?, ?)")
      .run(user.id, slug, name, visibility, keyHash, Date.now());
    const id = Number(r.lastInsertRowid);
    db.prepare("INSERT INTO board_members (board_id, user_id) VALUES (?, ?)").run(id, user.id);
    setAccess(db, id, allow, deny);
    return id;
  });
  logAction(user.username, "channel.create", { board: id, slug, visibility });
  return boardOut(db, getBoard(db, id)!, user);
}

function join(db: DB, board: Board, user: User): void {
  db.prepare("INSERT OR IGNORE INTO board_members (board_id, user_id) VALUES (?, ?)").run(board.id, user.id);
  logAction(user.username, "channel.join", { board: board.id });
}

export async function joinChannel(db: DB, user: User, slug: string, body: Record<string, unknown>) {
  const board = boardBySlug(db, "channel", slug.toLowerCase());
  if (!board) throw new HttpError(404, "no such channel");
  if (isMember(db, board.id, user.id)) return boardOut(db, board, user);
  if (denied(db, board.id, user.username)) throw new HttpError(403, "you've been kept out of this channel");
  if (board.visibility === "list" && !allowed(db, board.id, user.username)) {
    throw new HttpError(403, "this channel is invite-only and you're not on its list");
  }
  if (board.visibility === "key") {
    const key = typeof body.key === "string" ? body.key : "";
    if (!key || !(await verifySecret(key, board.key_hash!))) {
      logAction(user.username, "channel.join.fail", { board: board.id });
      throw new HttpError(403, "wrong key", { needsKey: true });
    }
  }
  join(db, board, user);
  return boardOut(db, board, user);
}

export function updateAccess(db: DB, user: User, slug: string, body: Record<string, unknown>) {
  const board = boardBySlug(db, "channel", slug.toLowerCase());
  if (!board) throw new HttpError(404, "no such channel");
  if (board.owner_id !== user.id) throw new HttpError(403, "only the channel's creator can change who's allowed in");
  const allow = usernameList(body.allow, "allow");
  const deny = usernameList(body.deny, "deny").filter((u) => u !== user.username);
  tx(db, () => setAccess(db, board.id, allow, deny));
  logAction(user.username, "channel.access", { board: board.id, allow: allow.length, deny: deny.length });
  return boardOut(db, board, user);
}

export function stats(db: DB) {
  const count = (sql: string) => (db.prepare(sql).get() as { c: number }).c;
  return {
    users: count("SELECT COUNT(*) AS c FROM users"),
    notes: count("SELECT COUNT(*) AS c FROM notes"),
    privateNotes: count("SELECT COUNT(*) AS c FROM notes WHERE visibility = 'private'"),
    channels: count("SELECT COUNT(*) AS c FROM boards WHERE kind = 'channel'"),
    sessions: count(`SELECT COUNT(*) AS c FROM sessions WHERE expires_at > ${Date.now()}`),
  };
}

