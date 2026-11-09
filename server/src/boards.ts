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
  description: string;
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
  proof: number; // 0 or 1: the creator confirmed the finish criteria
  version: number;
  created_at: number;
  updated_at: number;
}

export interface ArrowRow {
  id: number;
  board_id: number;
  from_note: number;
  to_note: number;
  from_side: Side | null;
  from_t: number | null;
  to_side: Side | null;
  to_t: number | null;
  color: string | null;
}
export interface SectionRow {
  id: number;
  board_id: number;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  created_by: number;
  created_at: number;
}
export type Side = "top" | "right" | "bottom" | "left";
export const SIDES: readonly Side[] = ["top", "right", "bottom", "left"];

export const COLORS = ["yellow", "pink", "blue", "green", "orange", "purple"] as const;
export const SECTION_COLORS = ["yellow", "blue", "green", "pink", "purple", "orange"] as const;
export const SECTION_NAME_MAX = 40;
export const SECTION_MIN_W = 80;
export const SECTION_MIN_H = 60;
export const SIDE_STATUSES = ["progress", "done"] as const;
export type SideStatus = (typeof SIDE_STATUSES)[number];
export const NOTE_MAX = 280;
export const COMMENT_MAX = 500;
export const LABEL_MAX = 24;
export const LABELS_PER_NOTE = 5;
export const DESCRIPTION_MAX = 140;

/**
 * Wired up by the real-time layer (realtime.ts): REST writes are broadcast to
 * the board's room after they commit, and moves respect the drag lock.
 */
export const hooks = {
  noteUpserted: (_board: Board, _note: NoteRow): void => {},
  noteDeleted: (_board: Board, _note: NoteRow): void => {},
  lockHolder: (_noteId: number): number | null => null,
  arrowUpserted: (_board: Board, _arrow: ArrowRow): void => {},
  arrowDeleted: (_board: Board, _arrow: ArrowRow): void => {},
  sectionUpserted: (_board: Board, _section: SectionRow): void => {},
  sectionDeleted: (_board: Board, _section: SectionRow): void => {},
  /** A note's visibility changed: re-send (or retract) the arrows touching it, per viewer. */
  noteArrowsChanged: (_board: Board, _note: NoteRow): void => {},
  /** Something on a note's back side (status, proof, comments) changed. */
  sideChanged: (_board: Board, _note: NoteRow): void => {},
};

const BOARD_COLS = "b.id, b.kind, b.owner_id, u.username AS owner_name, b.slug, b.name, b.visibility, b.key_hash, b.description, b.created_at";
const NOTE_COLS = "n.id, n.board_id, n.author_id, u.username AS author, n.text, n.color, n.x, n.y, n.z, n.visibility, n.labels, n.proof, n.version, n.created_at, n.updated_at";

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

/** What a note shows of its back side to one viewer. */
export interface SideSummary {
  myStatus: SideStatus | null;
  proof: boolean;
  commentCount: number;
  doneCount: number;
  progressCount: number;
  needsProof: boolean;
}

interface SummaryRow {
  id: number;
  my: SideStatus | null;
  done: number;
  progress: number;
  comments: number;
}

// One statement however many notes: the counts are correlated subqueries on
// note_status's primary key and note_comments' (note_id, created_at) index.
const SUMMARY_SQL = `SELECT n.id,
    (SELECT s.status FROM note_status s WHERE s.note_id = n.id AND s.user_id = @me) AS my,
    (SELECT COUNT(*) FROM note_status s WHERE s.note_id = n.id AND s.status = 'done') AS done,
    (SELECT COUNT(*) FROM note_status s WHERE s.note_id = n.id AND s.status = 'progress') AS progress,
    (SELECT COUNT(*) FROM note_comments c WHERE c.note_id = n.id) AS comments
  FROM notes n`;

function summaryOf(note: NoteRow, row: SummaryRow | undefined, userId: number): SideSummary {
  const doneCount = row?.done ?? 0;
  return {
    myStatus: row?.my ?? null,
    proof: note.proof === 1,
    commentCount: row?.comments ?? 0,
    doneCount,
    progressCount: row?.progress ?? 0,
    needsProof: note.author_id === userId && doneCount > 0 && note.proof !== 1,
  };
}

export function noteSummary(db: DB, note: NoteRow, userId: number): SideSummary {
  const row = db.prepare(`${SUMMARY_SQL} WHERE n.id = @id`).get({ id: note.id, me: userId }) as SummaryRow | undefined;
  return summaryOf(note, row, userId);
}

export function noteOut(db: DB, board: Board, note: NoteRow, userId: number, summary: SideSummary = noteSummary(db, note, userId)) {
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
    ...summary,
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
    description: board.description,
    // the key itself is never stored in the clear, nor its hash ever sent
    ...(board.kind === "channel" && isOwner ? { access: accessLists(db, board.id) } : {}),
  };
}

function listNotes(db: DB, board: Board, user: User) {
  const rows = db.prepare(`SELECT ${NOTE_COLS} FROM notes n JOIN users u ON u.id = n.author_id WHERE n.board_id = ? ORDER BY n.z`).all(board.id) as unknown as NoteRow[];
  const sums = new Map((db.prepare(`${SUMMARY_SQL} WHERE n.board_id = @b`).all({ b: board.id, me: user.id }) as unknown as SummaryRow[]).map((r) => [r.id, r]));
  return rows.filter((n) => canSee(board, n, user.id)).map((n) => noteOut(db, board, n, user.id, summaryOf(n, sums.get(n.id), user.id)));
}

// ---------------------------------------------------------------- reads

export function userBoard(db: DB, user: User, username: string) {
  const board = boardBySlug(db, "user", username.toLowerCase());
  if (!board) throw new HttpError(404, "no such user");
  markSeen(db, board.id, user.id);
  const notes = listNotes(db, board, user);
  return { board: boardOut(db, board, user), notes, arrows: listArrows(db, board, notes), sections: listSections(db, board) };
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
  markSeen(db, board.id, user.id);
  return { board: boardOut(db, board, user), notes: listNotes(db, board, user), arrows: [], sections: listSections(db, board) };
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

/** Status is per person now (PUT /api/notes/:id/status); the old shared field is refused. */
function refuseStatus(body: Record<string, unknown>): void {
  if (body.status !== undefined) throw new HttpError(400, "status is set per person with PUT /api/notes/:id/status");
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
  refuseStatus(body);
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
  return noteOut(db, board, note, user.id);
}

export function noteForWrite(db: DB, user: User, noteId: number): { board: Board; note: NoteRow } {
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
  refuseStatus(body);
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
  if (changed.includes("visibility")) hooks.noteArrowsChanged(board, updated);
  return noteOut(db, board, updated, user.id);
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


// ---------------------------------------------------------------- arrows

// One-way links between two notes of a user board. Only the board's owner
// draws, moves, recolours or deletes them; a visitor sees the ones whose two
// notes they can see (the same rule as notes, so a private note's arrows
// never leak). Channel boards have none.

const ARROW_COLS = "id, board_id, from_note, to_note, from_side, from_t, to_side, to_t, color";

export function arrowOut(r: ArrowRow) {
  return { id: r.id, from: r.from_note, to: r.to_note, fromSide: r.from_side, fromT: r.from_t, toSide: r.to_side, toT: r.to_t, color: r.color };
}

export function getArrow(db: DB, id: number): ArrowRow | undefined {
  return db.prepare(`SELECT ${ARROW_COLS} FROM note_arrows WHERE id = ?`).get(id) as ArrowRow | undefined;
}

export function arrowsOfNote(db: DB, noteId: number): ArrowRow[] {
  return db.prepare(`SELECT ${ARROW_COLS} FROM note_arrows WHERE from_note = ? OR to_note = ?`).all(noteId, noteId) as unknown as ArrowRow[];
}

/** Can this viewer see both ends of the arrow? */
export function canSeeArrow(db: DB, board: Board, arrow: ArrowRow, userId: number): boolean {
  const a = getNote(db, arrow.from_note);
  const b = getNote(db, arrow.to_note);
  return !!a && !!b && canSee(board, a, userId) && canSee(board, b, userId);
}

function listArrows(db: DB, board: Board, visible: { id: number }[]) {
  if (board.kind !== "user") return [];
  const ids = new Set(visible.map((n) => n.id));
  const rows = db.prepare(`SELECT ${ARROW_COLS} FROM note_arrows WHERE board_id = ? ORDER BY id`).all(board.id) as unknown as ArrowRow[];
  return rows.filter((r) => ids.has(r.from_note) && ids.has(r.to_note)).map(arrowOut);
}

/** side and t together: both null/missing means "no anchor". */
function parseAnchor(side: unknown, t: unknown, what: string): { side: Side | null; t: number | null } {
  if ((side === undefined || side === null) && (t === undefined || t === null)) return { side: null, t: null };
  if (typeof side !== "string" || !(SIDES as readonly string[]).includes(side) || typeof t !== "number" || !Number.isFinite(t) || t < 0 || t > 1) {
    throw new HttpError(400, `${what} anchor must be a side (${SIDES.join(", ")}) and a position from 0 to 1`);
  }
  return { side: side as Side, t };
}

function noteIdOf(body: Record<string, unknown>, key: string): number {
  const v = body[key];
  if (typeof v !== "number" || !Number.isInteger(v)) throw new HttpError(400, `${key} must be a note id`);
  return v;
}

/** The notes must exist on this board; a note elsewhere is a note that doesn't exist. */
function arrowNote(db: DB, board: Board, id: number): NoteRow {
  const n = getNote(db, id);
  if (!n || n.board_id !== board.id) throw new HttpError(404, "no such note on this board");
  return n;
}

export function createArrow(db: DB, user: User, boardId: number, body: Record<string, unknown>): { arrow: ReturnType<typeof arrowOut>; created: boolean } {
  const board = getBoard(db, boardId);
  if (!board || board.kind !== "user") throw new HttpError(404, "no such board");
  if (board.owner_id !== user.id) throw new HttpError(403, "only the board's owner can draw arrows");
  const from = noteIdOf(body, "from");
  const to = noteIdOf(body, "to");
  if (from === to) throw new HttpError(400, "an arrow can't point at its own note");
  arrowNote(db, board, from);
  arrowNote(db, board, to);
  const fa = parseAnchor(body.fromSide, body.fromT, "from");
  const ta = parseAnchor(body.toSide, body.toT, "to");
  const color = body.color === undefined || body.color === null ? null : parseColor(body.color);
  const existing = db.prepare(`SELECT ${ARROW_COLS} FROM note_arrows WHERE from_note = ? AND to_note = ?`).get(from, to) as ArrowRow | undefined;
  if (existing) return { arrow: arrowOut(existing), created: false };
  const r = db
    .prepare("INSERT INTO note_arrows (board_id, from_note, to_note, from_side, from_t, to_side, to_t, color) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(board.id, from, to, fa.side, fa.t, ta.side, ta.t, color);
  const row = getArrow(db, Number(r.lastInsertRowid))!;
  logAction(user.username, "arrow.create", { board: board.id, arrow: row.id, from, to });
  hooks.arrowUpserted(board, row);
  return { arrow: arrowOut(row), created: true };
}

/** Owner-only access to an existing arrow. A visitor who can't see its notes gets a 404, not a hint it exists. */
function arrowForWrite(db: DB, user: User, arrowId: number): { board: Board; arrow: ArrowRow } {
  const arrow = getArrow(db, arrowId);
  const board = arrow && getBoard(db, arrow.board_id);
  if (!arrow || !board || board.kind !== "user") throw new HttpError(404, "no such arrow");
  if (board.owner_id !== user.id) {
    if (!canSeeArrow(db, board, arrow, user.id)) throw new HttpError(404, "no such arrow");
    throw new HttpError(403, "only the board's owner can change arrows");
  }
  return { board, arrow };
}

/** Move an end along its note's border, re-target it, or recolour the arrow. */
export function updateArrow(db: DB, user: User, arrowId: number, body: Record<string, unknown>) {
  const { board, arrow } = arrowForWrite(db, user, arrowId);
  const from = body.from === undefined ? arrow.from_note : noteIdOf(body, "from");
  const to = body.to === undefined ? arrow.to_note : noteIdOf(body, "to");
  if (from === to) throw new HttpError(400, "an arrow can't point at its own note");
  arrowNote(db, board, from);
  arrowNote(db, board, to);
  // an end that moved to another note without a new anchor goes back to centre
  const anchor = (k: "from" | "to", changed: boolean) => {
    const sideKey = `${k}Side`;
    const tKey = `${k}T`;
    if (sideKey in body || tKey in body) return parseAnchor(body[sideKey], body[tKey], k);
    return changed ? { side: null, t: null } : { side: arrow[`${k}_side`], t: arrow[`${k}_t`] };
  };
  const fa = anchor("from", from !== arrow.from_note);
  const ta = anchor("to", to !== arrow.to_note);
  const color = body.color === undefined ? arrow.color : body.color === null ? null : parseColor(body.color);
  if (from !== arrow.from_note || to !== arrow.to_note) {
    if (db.prepare("SELECT 1 FROM note_arrows WHERE from_note = ? AND to_note = ? AND id <> ?").get(from, to, arrow.id)) {
      throw new HttpError(409, "that arrow already exists");
    }
  }
  if (!["from", "to", "fromSide", "fromT", "toSide", "toT", "color"].some((k) => k in body)) throw new HttpError(400, "nothing to change");
  db.prepare("UPDATE note_arrows SET from_note = ?, to_note = ?, from_side = ?, from_t = ?, to_side = ?, to_t = ?, color = ? WHERE id = ?").run(from, to, fa.side, fa.t, ta.side, ta.t, color, arrow.id);
  const row = getArrow(db, arrow.id)!;
  logAction(user.username, "arrow.update", { board: board.id, arrow: arrow.id });
  hooks.arrowUpserted(board, row);
  return arrowOut(row);
}

export function deleteArrow(db: DB, user: User, arrowId: number): void {
  const { board, arrow } = arrowForWrite(db, user, arrowId);
  db.prepare("DELETE FROM note_arrows WHERE id = ?").run(arrow.id);
  logAction(user.username, "arrow.delete", { board: board.id, arrow: arrow.id });
  hooks.arrowDeleted(board, arrow);
}

// ---------------------------------------------------------------- sections

// Named, tinted rectangles behind the notes. Which notes are "in" one is
// worked out by the client from positions, so moving a section never touches a
// note. Sections on a board never overlap (touching edges is fine). On a user
// board only its owner writes; on a channel any member does. Everyone who can
// see the board sees its sections.

const SECTION_COLS = "id, board_id, name, x, y, w, h, color, created_by, created_at";
const SECTION_COORD_MAX = 1_000_000;

export function sectionOut(r: SectionRow) {
  return { id: r.id, boardId: r.board_id, name: r.name, x: r.x, y: r.y, w: r.w, h: r.h, color: r.color };
}

export function getSection(db: DB, id: number): SectionRow | undefined {
  return db.prepare(`SELECT ${SECTION_COLS} FROM board_sections WHERE id = ?`).get(id) as SectionRow | undefined;
}

function listSections(db: DB, board: Board) {
  const rows = db.prepare(`SELECT ${SECTION_COLS} FROM board_sections WHERE board_id = ? ORDER BY id`).all(board.id) as unknown as SectionRow[];
  return rows.map(sectionOut);
}

function canWriteSections(db: DB, board: Board, user: User): boolean {
  return board.kind === "user" ? board.owner_id === user.id : isMember(db, board.id, user.id);
}

function sectionNumber(v: unknown, key: string, min?: number): number {
  if (typeof v !== "number" || !Number.isFinite(v) || Math.abs(v) > SECTION_COORD_MAX) throw new HttpError(400, `${key} must be a number`);
  if (min !== undefined && v < min) throw new HttpError(400, `${key} must be at least ${min}`);
  return v;
}

function sectionName(v: unknown): string {
  if (typeof v !== "string") throw new HttpError(400, "name must be a string");
  const name = v.trim();
  if (name.length < 1 || name.length > SECTION_NAME_MAX) throw new HttpError(400, `name must be 1 to ${SECTION_NAME_MAX} characters`);
  return name;
}

function sectionColor(v: unknown): string {
  if (typeof v !== "string" || !(SECTION_COLORS as readonly string[]).includes(v)) {
    throw new HttpError(400, `color must be one of ${SECTION_COLORS.join(", ")}`);
  }
  return v;
}

function assertNoOverlap(db: DB, boardId: number, r: { x: number; y: number; w: number; h: number }, exceptId: number): void {
  const clash = db
    .prepare("SELECT 1 FROM board_sections WHERE board_id = ? AND id <> ? AND x < ? AND x + w > ? AND y < ? AND y + h > ?")
    .get(boardId, exceptId, r.x + r.w, r.x, r.y + r.h, r.y);
  if (clash) throw new HttpError(409, "sections can't overlap");
}

export function createSection(db: DB, user: User, boardId: number, body: Record<string, unknown>) {
  const board = getBoard(db, boardId);
  if (!board) throw new HttpError(404, "no such board");
  if (!canWriteSections(db, board, user)) {
    throw new HttpError(403, board.kind === "user" ? "only the board's owner can draw sections" : "only channel members can draw sections");
  }
  const name = sectionName(body.name);
  const rect = { x: sectionNumber(body.x, "x"), y: sectionNumber(body.y, "y"), w: sectionNumber(body.w, "w", SECTION_MIN_W), h: sectionNumber(body.h, "h", SECTION_MIN_H) };
  const color = body.color === undefined || body.color === null ? SECTION_COLORS[0] : sectionColor(body.color);
  return tx(db, () => {
    assertNoOverlap(db, board.id, rect, 0);
    const r = db
      .prepare("INSERT INTO board_sections (board_id, name, x, y, w, h, color, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(board.id, name, rect.x, rect.y, rect.w, rect.h, color, user.id, Date.now());
    const row = getSection(db, Number(r.lastInsertRowid))!;
    logAction(user.username, "section.create", { board: board.id, section: row.id });
    hooks.sectionUpserted(board, row);
    return sectionOut(row);
  });
}

/** Write access to an existing section; someone who can't write gets a 403. */
function sectionForWrite(db: DB, user: User, sectionId: number): { board: Board; section: SectionRow } {
  const section = getSection(db, sectionId);
  const board = section && getBoard(db, section.board_id);
  if (!section || !board) throw new HttpError(404, "no such section");
  if (!canWriteSections(db, board, user)) {
    // a channel's non-member shouldn't learn it exists, but the brief asks for a plain 403
    throw new HttpError(403, board.kind === "user" ? "only the board's owner can change sections" : "only channel members can change sections");
  }
  return { board, section };
}

export function updateSection(db: DB, user: User, sectionId: number, body: Record<string, unknown>) {
  const { board, section } = sectionForWrite(db, user, sectionId);
  if (!["name", "x", "y", "w", "h", "color"].some((k) => k in body)) throw new HttpError(400, "nothing to change");
  const name = "name" in body ? sectionName(body.name) : section.name;
  const rect = {
    x: "x" in body ? sectionNumber(body.x, "x") : section.x,
    y: "y" in body ? sectionNumber(body.y, "y") : section.y,
    w: "w" in body ? sectionNumber(body.w, "w", SECTION_MIN_W) : section.w,
    h: "h" in body ? sectionNumber(body.h, "h", SECTION_MIN_H) : section.h,
  };
  const color = "color" in body ? sectionColor(body.color) : section.color;
  return tx(db, () => {
    assertNoOverlap(db, board.id, rect, section.id);
    db.prepare("UPDATE board_sections SET name = ?, x = ?, y = ?, w = ?, h = ?, color = ? WHERE id = ?").run(name, rect.x, rect.y, rect.w, rect.h, color, section.id);
    const row = getSection(db, section.id)!;
    logAction(user.username, "section.update", { board: board.id, section: section.id });
    hooks.sectionUpserted(board, row);
    return sectionOut(row);
  });
}

/** Deletes the zone only; the notes inside it are untouched. */
export function deleteSection(db: DB, user: User, sectionId: number): void {
  const { board, section } = sectionForWrite(db, user, sectionId);
  db.prepare("DELETE FROM board_sections WHERE id = ?").run(section.id);
  logAction(user.username, "section.delete", { board: board.id, section: section.id });
  hooks.sectionDeleted(board, section);
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
  const description = (str(body, "description", { max: DESCRIPTION_MAX, optional: true }) ?? "").trim();
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
      .prepare("INSERT INTO boards (kind, owner_id, slug, name, visibility, key_hash, description, created_at) VALUES ('channel', ?, ?, ?, ?, ?, ?, ?)")
      .run(user.id, slug, name, visibility, keyHash, description, Date.now());
    const id = Number(r.lastInsertRowid);
    db.prepare("INSERT INTO board_members (board_id, user_id) VALUES (?, ?)").run(id, user.id);
    markSeen(db, id, user.id);
    setAccess(db, id, allow, deny);
    return id;
  });
  logAction(user.username, "channel.create", { board: id, slug, visibility });
  return boardOut(db, getBoard(db, id)!, user);
}

function join(db: DB, board: Board, user: User): void {
  db.prepare("INSERT OR IGNORE INTO board_members (board_id, user_id) VALUES (?, ?)").run(board.id, user.id);
  markSeen(db, board.id, user.id); // what was there before you joined isn't "new"

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

export async function updateAccess(db: DB, user: User, slug: string, body: Record<string, unknown>) {
  const board = boardBySlug(db, "channel", slug.toLowerCase());
  if (!board) throw new HttpError(404, "no such channel");
  if (board.owner_id !== user.id) throw new HttpError(403, "only the channel's creator can change who's allowed in");
  // channels start public when someone first opens them; the creator can
  // close them later. A key is needed when switching to key, optional after.
  const visibility = body.visibility ?? board.visibility;
  if (visibility !== "public" && visibility !== "key" && visibility !== "list") {
    throw new HttpError(400, "visibility must be public, key or list");
  }
  const name = body.name === undefined ? board.name : str(body, "name", { min: 1, max: 40 })!.trim();
  if (!name) throw new HttpError(400, "name is required");
  const description = body.description === undefined ? board.description : (str(body, "description", { max: DESCRIPTION_MAX, optional: true }) ?? "").trim();
  let keyHash = visibility === "key" ? board.key_hash : null;
  if (visibility === "key" && (body.key !== undefined || !keyHash)) keyHash = await hashSecret(str(body, "key", { min: 4, max: 100 })!);
  const allow = usernameList(body.allow, "allow");
  const deny = usernameList(body.deny, "deny").filter((u) => u !== user.username);
  tx(db, () => {
    db.prepare("UPDATE boards SET name = ?, description = ?, visibility = ?, key_hash = ? WHERE id = ?").run(name, description, visibility, keyHash, board.id);
    setAccess(db, board.id, allow, deny);
  });
  logAction(user.username, "channel.access", { board: board.id, visibility, allow: allow.length, deny: deny.length });
  return boardOut(db, getBoard(db, board.id)!, user);
}

export function leaveChannel(db: DB, user: User, slug: string): void {
  const board = boardBySlug(db, "channel", slug.toLowerCase());
  if (!board) throw new HttpError(404, "no such channel");
  if (board.owner_id === user.id) throw new HttpError(400, "you made this channel, so you can't leave it");
  tx(db, () => {
    db.prepare("DELETE FROM board_members WHERE board_id = ? AND user_id = ?").run(board.id, user.id);
    db.prepare("DELETE FROM board_seen WHERE board_id = ? AND user_id = ?").run(board.id, user.id);
  });
  logAction(user.username, "channel.leave", { board: board.id });
}

// ---------------------------------------------------------------- sidebar

/** You've looked at this board up to now (opening it, or being on it while notes arrive). */
export function markSeen(db: DB, boardId: number, userId: number): void {
  db.prepare("INSERT INTO board_seen (board_id, user_id, seen_at) VALUES (?, ?, ?) ON CONFLICT (user_id, board_id) DO UPDATE SET seen_at = excluded.seen_at").run(
    boardId,
    userId,
    Date.now(),
  );
}

/**
 * What the sidebar lists: the channels you're in, and the people whose boards
 * you've visited (yours first). "unread" counts notes someone else added since
 * you last looked, that you're allowed to see.
 */
export function sidebar(db: DB, user: User) {
  const unread = `(SELECT COUNT(*) FROM notes n WHERE n.board_id = b.id AND n.created_at > s.seen_at AND n.author_id <> @me
                    AND (n.visibility = 'public' OR b.owner_id = @me))`;
  const latest = "(SELECT MAX(n.created_at) FROM notes n WHERE n.board_id = b.id)";
  const channels = db
    .prepare(
      `SELECT b.slug, b.name, b.description, b.visibility, u.username AS owner, ${unread} AS unread, s.seen_at AS seenAt,
              COALESCE(${latest}, b.created_at) AS activeAt,
              (SELECT COUNT(*) FROM board_members m WHERE m.board_id = b.id) AS members
       FROM board_members bm JOIN boards b ON b.id = bm.board_id JOIN board_seen s ON s.board_id = b.id AND s.user_id = @me
       LEFT JOIN users u ON u.id = b.owner_id
       WHERE bm.user_id = @me AND b.kind = 'channel'`,
    )
    .all({ me: user.id }) as { slug: string; name: string; description: string; visibility: string; owner: string; unread: number; seenAt: number; activeAt: number; members: number }[];
  const people = db
    .prepare(
      `SELECT b.slug AS username, ${unread} AS unread, s.seen_at AS seenAt, COALESCE(${latest}, b.created_at) AS activeAt
       FROM board_seen s JOIN boards b ON b.id = s.board_id
       WHERE s.user_id = @me AND b.kind = 'user'`,
    )
    .all({ me: user.id }) as { username: string; unread: number; seenAt: number; activeAt: number }[];
  return { channels: channels.map((c) => ({ ...c, isOwner: c.owner === user.username })), people };
}

/** Drop someone from your sidebar (until you visit their board again). */
export function forgetPerson(db: DB, user: User, username: string): void {
  if (username.toLowerCase() === user.username) throw new HttpError(400, "your own board always stays");
  db.prepare("DELETE FROM board_seen WHERE user_id = ? AND board_id = (SELECT id FROM boards WHERE kind = 'user' AND slug = ?)").run(user.id, username.toLowerCase());
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

