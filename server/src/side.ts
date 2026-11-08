import type { DB } from "./db.ts";
import type { User } from "./auth.ts";
import type { Board, NoteRow, SideStatus } from "./boards.ts";
import { COMMENT_MAX, SIDE_STATUSES, hooks, noteForWrite, noteOut, noteSummary } from "./boards.ts";
import { HttpError } from "./http.ts";
import { logAction } from "./log.ts";

// A note's back side: each person's own status, the creator's proof tick, and
// comments. Every read and write goes through noteForWrite, so a note you
// can't see is a note that doesn't exist (404), the same as the note routes.

const COMMENTS_SHOWN = 500;

interface CommentRow {
  id: number;
  note_id: number;
  author_id: number;
  author: string;
  text: string;
  created_at: number;
  updated_at: number;
}

const COMMENT_COLS = "c.id, c.note_id, c.author_id, u.username AS author, c.text, c.created_at, c.updated_at";

function commentOut(board: Board, c: CommentRow, userId: number) {
  return {
    id: c.id,
    author: c.author,
    text: c.text,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
    mine: c.author_id === userId,
    canDelete: c.author_id === userId || board.owner_id === userId,
  };
}

function changed(db: DB, user: User, board: Board, note: NoteRow, action: string, extra: Record<string, unknown> = {}) {
  logAction(user.username, action, { board: board.id, note: note.id, ...extra });
  // proof lives on the note row, so re-read it before telling everyone
  hooks.sideChanged(board, db.prepare("SELECT n.id, n.board_id, n.author_id, u.username AS author, n.text, n.color, n.x, n.y, n.z, n.visibility, n.labels, n.proof, n.version, n.created_at, n.updated_at FROM notes n JOIN users u ON u.id = n.author_id WHERE n.id = ?").get(note.id) as unknown as NoteRow);
}

// ---------------------------------------------------------------- reads

export function readSide(db: DB, user: User, noteId: number) {
  const { board, note } = noteForWrite(db, user, noteId);
  const sum = noteSummary(db, note, user.id);
  const comments = db
    .prepare(
      `SELECT * FROM (SELECT ${COMMENT_COLS} FROM note_comments c JOIN users u ON u.id = c.author_id WHERE c.note_id = ? ORDER BY c.created_at DESC, c.id DESC LIMIT ${COMMENTS_SHOWN}) ORDER BY created_at, id`,
    )
    .all(note.id) as unknown as CommentRow[];
  const out: Record<string, unknown> = {
    proof: sum.proof,
    myStatus: sum.myStatus,
    counts: { done: sum.doneCount, progress: sum.progressCount },
    comments: comments.map((c) => commentOut(board, c, user.id)),
  };
  // who is on the note is for its creator only
  if (note.author_id === user.id) {
    out.people = db
      .prepare("SELECT u.username AS name, s.status, s.updated_at AS at FROM note_status s JOIN users u ON u.id = s.user_id WHERE s.note_id = ? ORDER BY s.updated_at DESC, u.username")
      .all(note.id);
  }
  return out;
}

// ---------------------------------------------------------------- status and proof

export function setStatus(db: DB, user: User, noteId: number, body: Record<string, unknown>) {
  const { board, note } = noteForWrite(db, user, noteId);
  const v = body.status;
  if (v !== null && (typeof v !== "string" || !(SIDE_STATUSES as readonly string[]).includes(v))) {
    throw new HttpError(400, `status must be ${SIDE_STATUSES.join(", ")} or null`);
  }
  if (v === null) db.prepare("DELETE FROM note_status WHERE note_id = ? AND user_id = ?").run(note.id, user.id);
  else {
    db.prepare(
      "INSERT INTO note_status (note_id, user_id, status, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT (note_id, user_id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at",
    ).run(note.id, user.id, v as SideStatus, Date.now());
  }
  changed(db, user, board, note, "note.status", { status: v });
  return noteOut(db, board, note, user.id);
}

export function setProof(db: DB, user: User, noteId: number, body: Record<string, unknown>) {
  const { board, note } = noteForWrite(db, user, noteId);
  if (typeof body.proof !== "boolean") throw new HttpError(400, "proof must be true or false");
  if (note.author_id !== user.id) throw new HttpError(403, "only the note's creator can tick proof");
  db.prepare("UPDATE notes SET proof = ?, proof_at = ? WHERE id = ?").run(body.proof ? 1 : 0, body.proof ? Date.now() : null, note.id);
  changed(db, user, board, note, "note.proof", { proof: body.proof });
  return noteOut(db, board, { ...note, proof: body.proof ? 1 : 0 }, user.id);
}

// ---------------------------------------------------------------- comments

function parseText(body: Record<string, unknown>): string {
  if (typeof body.text !== "string") throw new HttpError(400, "text is required");
  const text = body.text.trim();
  if (!text) throw new HttpError(400, "a comment can't be empty");
  if (text.length > COMMENT_MAX) throw new HttpError(400, `a comment can be at most ${COMMENT_MAX} characters`);
  return text;
}

function getComment(db: DB, id: number): CommentRow | undefined {
  return db.prepare(`SELECT ${COMMENT_COLS} FROM note_comments c JOIN users u ON u.id = c.author_id WHERE c.id = ?`).get(id) as CommentRow | undefined;
}

export function addComment(db: DB, user: User, noteId: number, body: Record<string, unknown>) {
  const { board, note } = noteForWrite(db, user, noteId);
  const text = parseText(body);
  const now = Date.now();
  const r = db.prepare("INSERT INTO note_comments (note_id, author_id, text, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(note.id, user.id, text, now, now);
  const c = getComment(db, Number(r.lastInsertRowid))!;
  changed(db, user, board, note, "comment.create", { comment: c.id }); // never the text
  return commentOut(board, c, user.id);
}

/** The comment, its note and board, or a 404 when you can't see the note. */
function commentForWrite(db: DB, user: User, id: number) {
  const c = getComment(db, id);
  if (!c) throw new HttpError(404, "no such comment");
  const { board, note } = noteForWrite(db, user, c.note_id);
  return { c, board, note };
}

export function editComment(db: DB, user: User, id: number, body: Record<string, unknown>) {
  const { c, board, note } = commentForWrite(db, user, id);
  if (c.author_id !== user.id) throw new HttpError(403, "you can only edit your own comments");
  const text = parseText(body);
  db.prepare("UPDATE note_comments SET text = ?, updated_at = ? WHERE id = ?").run(text, Date.now(), c.id);
  changed(db, user, board, note, "comment.update", { comment: c.id });
  return commentOut(board, getComment(db, c.id)!, user.id);
}

export function deleteComment(db: DB, user: User, id: number): void {
  const { c, board, note } = commentForWrite(db, user, id);
  if (c.author_id !== user.id && board.owner_id !== user.id) throw new HttpError(403, "you can only delete your own comments");
  db.prepare("DELETE FROM note_comments WHERE id = ?").run(c.id);
  changed(db, user, board, note, "comment.delete", { comment: c.id });
}
