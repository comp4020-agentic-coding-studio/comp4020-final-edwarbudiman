import type { IncomingMessage, ServerResponse } from "node:http";
import type { User } from "./auth.ts";
import { requireUserAny } from "./auth.ts";
import type { DB } from "./db.ts";
import { COLORS, NOTE_MAX, canMove, channelBoard, createNote, deleteNote, getBoard, getNote, hooks, isMember, noteForWrite, updateNote, userBoard } from "./boards.ts";
import { HttpError, sameOrigin, sendJson } from "./http.ts";
import { logAction } from "./log.ts";
import { addComment, setStatus } from "./side.ts";

// A user's own agent on their board, over MCP. One stateless endpoint, POST
// /mcp, JSON responses only (no SSE, no sessions), authed by the personal
// token from Settings. The token resolves to the same User the cookie would,
// so every tool goes through the same functions as the REST routes and the
// same canSee / canEdit / canMove apply. The tools are shaped after the jobs
// (read the board, move a status, add notes into sections), not after routes.

// ---------------------------------------------------------------- numbers shared with the client

// Notes have a fixed size, and a note belongs to the zone holding its centre
// (client/src/pages/Board.tsx: NOTE_W, NOTE_H, SEC_BAR_H, secHolds).
const NOTE_W = 200;
const NOTE_H = 160;
const SEC_BAR_H = 30; // the zone's name bar, which a placed note must not cover
const SEC_PAD = 10;
const GAP = 16;
const START = 24; // where a note with no section is first tried: the board's top-left
const SCAN_WIDTH = 1200; // how wide a row of unsectioned notes may grow before a new row starts
const SLOT_BUDGET = 2_000_000; // collision checks one placement may spend before it gives up

// ---------------------------------------------------------------- protocol

const VERSIONS = ["2025-03-26", "2025-06-18", "2026-07-28"];
const LATEST = VERSIONS[VERSIONS.length - 1];
const MAX_BODY = 64 * 1024;
const RATE_LIMIT = 60; // calls per minute per token
const RATE_WINDOW_MS = 60_000;
const BATCH_MAX = 20;

const INSTRUCTIONS = [
  "This is a Post-its board: notes placed freely on a canvas, where a note's position is its meaning. Named zones called sections group notes by where they sit.",
  "You act as the person who gave you this token, with exactly their permissions, on their own board (board \"me\"), someone else's (a username) or a channel (\"#slug\").",
  "Start with read_board. To put notes in a group, name the section in add_notes or move_notes_to_section; the server finds a free spot inside it.",
  "delete_notes needs each note's exact current text, so a stale id can't remove the wrong note; ask the person before deleting.",
  "Everyone watching the board sees your changes live, marked as made by the person's agent.",
].join(" ");

type Id = string | number | null;
interface RpcResponse {
  jsonrpc: "2.0";
  id: Id;
  result?: unknown;
  error?: { code: number; message: string };
}
const ok = (id: Id, result: unknown): RpcResponse => ({ jsonrpc: "2.0", id, result });
const fail = (id: Id, code: number, message: string): RpcResponse => ({ jsonrpc: "2.0", id, error: { code, message } });
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

// 60 calls a minute per user (a user has one token), a fixed window.
const windows = new Map<number, { start: number; n: number }>();
function rateLimited(userId: number): boolean {
  const now = Date.now();
  if (windows.size > 1000) for (const [k, w] of windows) if (now - w.start >= RATE_WINDOW_MS) windows.delete(k);
  let w = windows.get(userId);
  if (!w || now - w.start >= RATE_WINDOW_MS) {
    w = { start: now, n: 0 };
    windows.set(userId, w);
  }
  return ++w.n > RATE_LIMIT;
}

async function readBody(req: IncomingMessage): Promise<string> {
  const declared = Number(req.headers["content-length"] ?? 0);
  if (declared > MAX_BODY) throw new HttpError(413, "request body too large");
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new HttpError(413, "request body too large");
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function handleMcp(db: DB, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const rpcFail = (status: number, code: number, message: string, headers: Record<string, string> = {}) =>
    sendJson(res, status, fail(null, code, message), headers);

  if (req.method !== "POST") return rpcFail(405, -32000, "POST only: this endpoint is stateless and answers with plain JSON", { allow: "POST" });
  // Agents are not browsers and send no Origin. A page on another site that
  // reaches us with the person's cookie is refused.
  if (!sameOrigin(req)) return rpcFail(403, -32000, "cross-site request refused");

  let user: User;
  try {
    user = requireUserAny(db, req);
  } catch (err) {
    if (!(err instanceof HttpError)) throw err;
    return rpcFail(401, -32001, err.message, { "www-authenticate": 'Bearer realm="post-its"' });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(await readBody(req));
  } catch (err) {
    if (err instanceof HttpError) return rpcFail(err.status, -32600, err.message);
    return rpcFail(400, -32700, "parse error: the body is not JSON");
  }

  const batch = Array.isArray(payload);
  const messages: unknown[] = Array.isArray(payload) ? payload : [payload];
  if (messages.length === 0 || messages.length > BATCH_MAX) return rpcFail(400, -32600, `a batch holds 1 to ${BATCH_MAX} messages`);

  const out: RpcResponse[] = [];
  for (const m of messages) {
    const r = handleMessage(db, user, m);
    if (r) out.push(r);
  }
  if (out.length === 0) {
    res.writeHead(202).end(); // only notifications and responses: nothing to answer
    return;
  }
  const limited = out.length === 1 && out[0].error?.code === -32029;
  sendJson(res, limited ? 429 : 200, batch ? out : out[0], limited ? { "retry-after": "60" } : {});
}

function handleMessage(db: DB, user: User, msg: unknown): RpcResponse | null {
  if (!isObj(msg) || msg.jsonrpc !== "2.0") return fail(null, -32600, "invalid request");
  const id = typeof msg.id === "string" || typeof msg.id === "number" ? msg.id : undefined;
  if (typeof msg.method !== "string") {
    // a response to something we never sent is ignored, anything else is malformed
    return id !== undefined && ("result" in msg || "error" in msg) ? null : fail(id ?? null, -32600, "invalid request");
  }
  if (id === undefined) return null; // a notification (notifications/initialized and the like)

  if (rateLimited(user.id)) return fail(id, -32029, "rate limited: at most 60 calls a minute, try again shortly");
  const params = isObj(msg.params) ? msg.params : {};

  switch (msg.method) {
    case "initialize": {
      const asked = params.protocolVersion;
      const version = typeof asked === "string" && VERSIONS.includes(asked) ? asked : LATEST;
      return ok(id, { protocolVersion: version, capabilities: { tools: { listChanged: false } }, serverInfo: { name: "post-its", version: "1.0.0" }, instructions: INSTRUCTIONS });
    }
    case "ping":
      return ok(id, {});
    case "tools/list":
      return ok(id, { tools: TOOLS.map(({ run: _run, ...tool }) => tool) });
    case "tools/call": {
      const tool = TOOLS.find((t) => t.name === params.name);
      if (!tool) return fail(id, -32602, `unknown tool ${String(params.name)}`);
      if (params.arguments !== undefined && !isObj(params.arguments)) return fail(id, -32602, "arguments must be an object");
      logAction(user.username, "mcp.call", { tool: tool.name, via: "agent" }); // never the arguments
      try {
        const r = tool.run(db, user, (params.arguments as Record<string, unknown> | undefined) ?? {});
        return ok(id, { content: [{ type: "text", text: r.text }], ...(r.isError ? { isError: true } : {}) });
      } catch (err) {
        if (!(err instanceof HttpError)) throw err;
        return ok(id, { content: [{ type: "text", text: sentence(err.message) }], isError: true });
      }
    }
    default:
      return fail(id, -32601, `method not found: ${msg.method}`);
  }
}

const sentence = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) + (/[.!?]$/.test(s) ? "" : ".") : "Something went wrong.");

// ---------------------------------------------------------------- boards and notes

type View = Pick<ReturnType<typeof userBoard>, "board" | "notes" | "sections">;
type NoteOut = View["notes"][number];
type SectionOut = View["sections"][number];
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const BOARD_ARG = 'The board: "me" (your own, the default), a username, or "#<channel-slug>".';

/** "me", a username or "#channel" to the board and what this person can see on it. Never joins a channel as a side effect. */
function resolveBoard(db: DB, user: User, arg: unknown): View {
  const ref = arg === undefined || arg === null || arg === "" ? "me" : arg;
  if (typeof ref !== "string") throw new HttpError(400, 'board must be "me", a username or "#<channel-slug>"');
  const name = ref.trim();
  if (name.startsWith("#")) {
    const slug = name.slice(1).toLowerCase();
    const row = db.prepare("SELECT id FROM boards WHERE kind = 'channel' AND slug = ?").get(slug) as { id: number } | undefined;
    if (!row) throw new HttpError(404, `no channel called #${slug}`);
    if (!isMember(db, row.id, user.id)) throw new HttpError(403, `you are not a member of #${slug}; join it in the app first`);
    return channelBoard(db, user, slug);
  }
  return userBoard(db, user, name.toLowerCase() === "me" ? user.username : name);
}

const noteCentreIn = (s: { x: number; y: number; w: number; h: number }, n: { x: number; y: number }): boolean => {
  const cx = n.x + NOTE_W / 2;
  const cy = n.y + NOTE_H / 2;
  return cx >= s.x && cx <= s.x + s.w && cy >= s.y && cy <= s.y + s.h;
};

/** The first section holding a note's centre, the same answer everywhere (zones never overlap anyway). */
const sectionOfNote = (sections: SectionOut[], n: { x: number; y: number }): SectionOut | undefined => sections.find((s) => noteCentreIn(s, n));

const statusName = (s: string | null): "none" | "on progress" | "done" => (s === "done" ? "done" : s === "progress" ? "on progress" : "none");
const STATUS_NAMES = ["none", "on progress", "done"] as const;
type StatusName = (typeof STATUS_NAMES)[number];

function parseStatus(v: unknown): StatusName {
  if (typeof v !== "string" || !(STATUS_NAMES as readonly string[]).includes(v)) throw new HttpError(400, 'status must be "none", "on progress" or "done"');
  return v as StatusName;
}

/** `- [done] #12 text`; a note by someone else also says its colour and author. Later lines of a multi-line text are indented. */
function noteLine(n: NoteOut, me: string): string {
  const who = n.author === me ? "" : `(${n.color}, by ${n.author}) `;
  return `- [${statusName(n.myStatus)}] #${n.id} ${who}${n.text.split("\n").join("\n  ")}`;
}

const plural = (n: number, one: string): string => `${n} ${one}${n === 1 ? "" : "s"}`;
const byPosition = (a: NoteOut, b: NoteOut): number => a.y - b.y || a.x - b.x || a.id - b.id;

function readBoard(db: DB, user: User, a: Record<string, unknown>) {
  const { board, notes, sections } = resolveBoard(db, user, a.board);
  const counts = { none: 0, "on progress": 0, done: 0 };
  for (const n of notes) counts[statusName(n.myStatus)]++;
  const lines = [`Board "${board.name}": ${plural(notes.length, "note")} (${counts.none} none, ${counts["on progress"]} on progress, ${counts.done} done), ${plural(sections.length, "section")}.`];
  for (const s of sections) {
    const inside = notes.filter((n) => sectionOfNote(sections, n) === s).sort(byPosition);
    lines.push("", `## ${s.name}`, ...(inside.length ? inside.map((n) => noteLine(n, user.username)) : ["(empty)"]));
  }
  const loose = notes.filter((n) => !sectionOfNote(sections, n)).sort(byPosition);
  if (loose.length) lines.push("", "## Not in a section", ...loose.map((n) => noteLine(n, user.username)));
  return { text: lines.join("\n") };
}

function findNotes(db: DB, user: User, a: Record<string, unknown>) {
  const { board, notes, sections } = resolveBoard(db, user, a.board);
  let found = [...notes];
  if (a.text !== undefined) {
    if (typeof a.text !== "string") throw new HttpError(400, "text must be a string");
    const q = a.text.trim().toLowerCase();
    if (q) found = found.filter((n) => n.text.toLowerCase().includes(q));
  }
  if (a.status !== undefined) {
    const want = parseStatus(a.status);
    found = found.filter((n) => statusName(n.myStatus) === want);
  }
  if (a.section !== undefined) {
    const s = findSection(sections, a.section);
    found = found.filter((n) => sectionOfNote(sections, n) === s);
  }
  found.sort(byPosition);
  return { text: found.length ? [`${plural(found.length, "note")} on "${board.name}":`, ...found.map((n) => noteLine(n, user.username))].join("\n") : `No notes on "${board.name}" match.` };
}

function findSection(sections: SectionOut[], name: unknown): SectionOut {
  const want = typeof name === "string" ? name.trim().toLowerCase() : "";
  const s = want ? sections.find((c) => c.name.trim().toLowerCase() === want) : undefined;
  if (s) return s;
  throw new HttpError(
    400,
    sections.length
      ? `no section called "${String(name)}" on this board. Sections here: ${sections.map((c) => `"${c.name}"`).join(", ")}`
      : `no section called "${String(name)}": this board has no sections yet (draw one in the app first)`,
  );
}

// ---------------------------------------------------------------- finding a free spot

interface Area {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * The first free top-left for one more note inside `area`, scanning rows from
 * the top. Candidates are the area's corner and the spots just right of and
 * just below each obstacle, so notes pack against each other with a gap.
 */
function findSlot(obstacles: Rect[], area: Area): { x: number; y: number } | null {
  const near = obstacles.filter((o) => o.x < area.x1 + GAP && o.x + o.w + GAP > area.x0 && o.y < area.y1 + GAP && o.y + o.h + GAP > area.y0);
  const xs = new Set([area.x0]);
  const ys = new Set([area.y0]);
  for (const o of near) {
    xs.add(o.x + o.w + GAP);
    ys.add(o.y + o.h + GAP);
  }
  const asc = (a: number, b: number) => a - b;
  const xl = [...xs].filter((x) => x >= area.x0 && x + NOTE_W <= area.x1).sort(asc);
  const yl = [...ys].filter((y) => y >= area.y0 && y + NOTE_H <= area.y1).sort(asc);
  let checks = 0;
  for (const y of yl) {
    for (const x of xl) {
      checks += near.length + 1;
      if (checks > SLOT_BUDGET) return null;
      if (!near.some((o) => x < o.x + o.w + GAP && x + NOTE_W + GAP > o.x && y < o.y + o.h + GAP && y + NOTE_H + GAP > o.y)) return { x, y };
    }
  }
  return null;
}

const noteRects = (db: DB, boardId: number, except?: Set<number>): Rect[] =>
  (db.prepare("SELECT id, x, y FROM notes WHERE board_id = ?").all(boardId) as unknown as { id: number; x: number; y: number }[])
    .filter((r) => !except?.has(r.id)) // every note counts, including ones this person can't see
    .map((r) => ({ x: r.x, y: r.y, w: NOTE_W, h: NOTE_H }));

const sectionArea = (s: SectionOut): Area => ({ x0: s.x + SEC_PAD, y0: s.y + SEC_BAR_H + SEC_PAD, x1: s.x + s.w - SEC_PAD, y1: s.y + s.h - SEC_PAD });
const asRect = (n: { x: number; y: number }): Rect => ({ x: n.x, y: n.y, w: NOTE_W, h: NOTE_H });

function noRoom(s: SectionOut): string {
  const a = sectionArea(s);
  if (a.x1 - a.x0 < NOTE_W || a.y1 - a.y0 < NOTE_H) {
    return `section "${s.name}" is too small for a note (it needs room for ${NOTE_W} by ${NOTE_H} below its name bar); make it bigger in the app`;
  }
  return `section "${s.name}" has no free space left`;
}

// ---------------------------------------------------------------- writes

/** Tell viewers a person's agent just changed this note (nobody is named for an anonymous user). */
function touch(db: DB, user: User, noteId: number): void {
  const note = getNote(db, noteId);
  const board = note && getBoard(db, note.board_id);
  if (note && board) hooks.agentTouched(board, note, user.anonymous ? null : user.username);
}

function noteId(v: unknown, key = "note_id"): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < 1) throw new HttpError(400, `${key} must be a whole number`);
  return v;
}

function text(v: unknown, key: string): string {
  if (typeof v !== "string") throw new HttpError(400, `${key} must be a string`);
  return v;
}

function setNoteStatus(db: DB, user: User, a: Record<string, unknown>) {
  const id = noteId(a.note_id);
  const status = parseStatus(a.status);
  setStatus(db, user, id, { status: status === "none" ? null : status === "done" ? "done" : "progress" });
  touch(db, user, id);
  return { text: `Note #${id} is now "${status}" for you.` };
}

function addNotes(db: DB, user: User, a: Record<string, unknown>) {
  const items = a.notes;
  if (!Array.isArray(items) || items.length < 1 || items.length > 20) throw new HttpError(400, "notes must be a list of 1 to 20 notes");
  const { board, sections } = resolveBoard(db, user, a.board);

  // Work out every spot first, so a full or unknown section fails the whole call before anything is written.
  const notes = noteRects(db, board.id);
  const zones = sections.map((s) => ({ x: s.x, y: s.y, w: s.w, h: s.h }));
  const plan = items.map((raw, i) => {
    if (!isObj(raw)) throw new HttpError(400, `note ${i + 1} must be an object with text`);
    const body = text(raw.text, `note ${i + 1}: text`).trim();
    if (!body) throw new HttpError(400, `note ${i + 1} has no text`);
    if (body.length > NOTE_MAX) throw new HttpError(400, `note ${i + 1}: text must be at most ${NOTE_MAX} characters`);
    const color = raw.color === undefined ? "yellow" : raw.color;
    if (typeof color !== "string" || !(COLORS as readonly string[]).includes(color)) throw new HttpError(400, `note ${i + 1}: color must be one of ${COLORS.join(", ")}`);
    const named = raw.section !== undefined && raw.section !== null && raw.section !== "";
    const section = named ? findSection(sections, raw.section) : null;
    const spot = section ? findSlot(notes, sectionArea(section)) : findSlot([...notes, ...zones], { x0: START, y0: START, x1: START + SCAN_WIDTH, y1: Infinity });
    if (!spot) throw new HttpError(409, section ? noRoom(section) : "the board is too crowded to place a note automatically");
    notes.push(asRect(spot));
    return { body, color, section, spot };
  });

  const lines = plan.map((p) => {
    const n = createNote(db, user, board.id, { text: p.body, color: p.color, x: p.spot.x, y: p.spot.y });
    touch(db, user, n.id);
    return `- #${n.id} ${p.section ? `in "${p.section.name}"` : "on the board, in no section"}`;
  });
  return { text: [`Added ${plural(lines.length, "note")}:`, ...lines].join("\n") };
}

function moveNotes(db: DB, user: User, a: Record<string, unknown>) {
  const raw = a.note_ids;
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 20) throw new HttpError(400, "note_ids must be a list of 1 to 20 note ids");
  const ids = [...new Set(raw.map((v) => noteId(v, "each note id")))];
  const { board, sections } = resolveBoard(db, user, a.board);
  const section = findSection(sections, a.section);
  const row = getBoard(db, board.id)!; // the access rules take the row, not the view
  const area = sectionArea(section);
  const obstacles = noteRects(db, board.id, new Set(ids)); // the notes being moved free their old spots

  const lines: string[] = [];
  let done = 0;
  for (const id of ids) {
    try {
      const { note } = noteForWrite(db, user, id);
      if (note.board_id !== board.id) throw new HttpError(400, "it is not on that board");
      if (noteCentreIn(section, note)) {
        lines.push(`- #${id} is already in "${section.name}".`);
        done++;
        obstacles.push(asRect(note));
        continue;
      }
      if (!canMove(row, note, user.id)) throw new HttpError(403, "you can only move your own notes here");
      const spot = findSlot(obstacles, area);
      if (!spot) throw new HttpError(409, noRoom(section));
      updateNote(db, user, id, { x: spot.x, y: spot.y });
      obstacles.push(asRect(spot));
      touch(db, user, id);
      lines.push(`- #${id} moved into "${section.name}".`);
      done++;
    } catch (err) {
      if (!(err instanceof HttpError)) throw err;
      lines.push(`- #${id} skipped: ${err.message}.`);
    }
  }
  return { text: lines.join("\n"), isError: done === 0 };
}

function editNote(db: DB, user: User, a: Record<string, unknown>) {
  const id = noteId(a.note_id);
  updateNote(db, user, id, { text: text(a.text, "text") });
  touch(db, user, id);
  return { text: `Note #${id} rewritten.` };
}

function commentOnNote(db: DB, user: User, a: Record<string, unknown>) {
  const id = noteId(a.note_id);
  addComment(db, user, id, { text: text(a.text, "text") });
  touch(db, user, id);
  return { text: `Comment added to note #${id}.` };
}

function deleteNotes(db: DB, user: User, a: Record<string, unknown>) {
  const items = a.notes;
  if (!Array.isArray(items) || items.length < 1 || items.length > 20) throw new HttpError(400, "notes must be a list of 1 to 20 notes, each with id and its current text");
  const lines: string[] = [];
  let deleted = 0;
  for (const raw of items) {
    if (!isObj(raw)) throw new HttpError(400, "each note must be an object with id and text");
    const id = noteId(raw.id, "each note's id");
    const expected = text(raw.text, "each note's text");
    try {
      const { note } = noteForWrite(db, user, id);
      if (note.text !== expected) {
        // the person can see this note, so the agent may see what it says now
        lines.push(`- #${id} skipped: its text is not what you sent (it now reads ${JSON.stringify(note.text)}), so nothing was deleted. Read it again and confirm.`);
        continue;
      }
      deleteNote(db, user, id);
      lines.push(`- #${id} deleted.`);
      deleted++;
    } catch (err) {
      if (!(err instanceof HttpError)) throw err;
      lines.push(`- #${id} skipped: ${err.message}.`);
    }
  }
  return { text: lines.join("\n"), isError: deleted === 0 };
}

// ---------------------------------------------------------------- the tool list

interface ToolResult {
  text: string;
  isError?: boolean;
}
interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: Record<string, boolean>;
  run: (db: DB, user: User, args: Record<string, unknown>) => ToolResult;
}

const boardArg = { type: "string", description: BOARD_ARG };
const STATUS_ENUM = [...STATUS_NAMES];

const TOOLS: Tool[] = [
  {
    name: "read_board",
    description:
      "Read a board as Markdown: a summary line (notes, counts by your own status, sections) and then each section's notes, one `- [status] #id text` line each. Start here. Notes by other people also show their colour and author.",
    inputSchema: { type: "object", properties: { board: boardArg } },
    annotations: { readOnlyHint: true },
    run: readBoard,
  },
  {
    name: "find_notes",
    description: "Find notes on a board by text, status or section. Returns the same `- [status] #id text` lines as read_board.",
    inputSchema: {
      type: "object",
      properties: {
        board: boardArg,
        text: { type: "string", description: "Keep notes whose text contains this (ignoring case)." },
        status: { type: "string", enum: STATUS_ENUM, description: "Keep notes with this status for you." },
        section: { type: "string", description: "Keep notes in the section with this name." },
      },
    },
    annotations: { readOnlyHint: true },
    run: findNotes,
  },
  {
    name: "set_status",
    description: 'Set your own status on a note: "none", "on progress" or "done". Move a note forward or mark it finished.',
    inputSchema: {
      type: "object",
      properties: { note_id: { type: "integer" }, status: { type: "string", enum: STATUS_ENUM } },
      required: ["note_id", "status"],
    },
    annotations: { destructiveHint: false, idempotentHint: true },
    run: setNoteStatus,
  },
  {
    name: "add_notes",
    description:
      "Add 1 to 20 notes. A note with a section goes to the first free spot inside that section's zone, never overlapping another note. With no section it goes to a free spot near the board's top-left. An unknown or full section fails the whole call and names the sections that exist.",
    inputSchema: {
      type: "object",
      properties: {
        board: boardArg,
        notes: {
          type: "array",
          minItems: 1,
          maxItems: 20,
          items: {
            type: "object",
            properties: {
              text: { type: "string", maxLength: NOTE_MAX },
              section: { type: "string", description: "Name of an existing section on the board." },
              color: { type: "string", enum: [...COLORS], description: "Defaults to yellow." },
            },
            required: ["text"],
          },
        },
      },
      required: ["notes"],
    },
    annotations: { destructiveHint: false },
    run: addNotes,
  },
  {
    name: "move_notes_to_section",
    description: "Move notes into a named section, to free spots inside its zone. Notes you may not move are skipped and listed.",
    inputSchema: {
      type: "object",
      properties: { board: boardArg, note_ids: { type: "array", items: { type: "integer" }, minItems: 1, maxItems: 20 }, section: { type: "string" } },
      required: ["note_ids", "section"],
    },
    annotations: { destructiveHint: false },
    run: moveNotes,
  },
  {
    name: "edit_note",
    description: "Rewrite a note's text (up to 280 characters), if you could edit it yourself.",
    inputSchema: { type: "object", properties: { note_id: { type: "integer" }, text: { type: "string", maxLength: NOTE_MAX } }, required: ["note_id", "text"] },
    annotations: { destructiveHint: true, idempotentHint: true },
    run: editNote,
  },
  {
    name: "comment_on_note",
    description: "Add a comment to a note's back side, posted as you.",
    inputSchema: { type: "object", properties: { note_id: { type: "integer" }, text: { type: "string", maxLength: 500 } }, required: ["note_id", "text"] },
    annotations: { destructiveHint: false },
    run: commentOnNote,
  },
  {
    name: "delete_notes",
    description:
      "Delete notes. Each entry needs the note's id and its exact current text; a note whose text differs is skipped, so a stale id can't remove the wrong note. Deleted notes cannot be restored, so confirm with the person first.",
    inputSchema: {
      type: "object",
      properties: {
        notes: {
          type: "array",
          minItems: 1,
          maxItems: 20,
          items: { type: "object", properties: { id: { type: "integer" }, text: { type: "string" } }, required: ["id", "text"] },
        },
      },
      required: ["notes"],
    },
    annotations: { destructiveHint: true },
    run: deleteNotes,
  },
];
