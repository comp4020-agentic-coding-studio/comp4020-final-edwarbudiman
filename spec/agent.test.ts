import { describe, expect, it } from "vitest";
import { mcpUrl, setupMessage } from "../client/src/agentSetup.ts";
import { baseUrl, boardOf, connect, login, secret, signup } from "./helpers.ts";
import type { Client } from "./helpers.ts";

// agent-mcp: a person's own agent on their board over POST /mcp, with a
// personal token that acts as the person and nothing more.

const NOTE_W = 200;
const NOTE_H = 160;

async function rpc(token: string | null, body: unknown, extra: Record<string, string> = {}) {
  const res = await fetch(new URL("/mcp", baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...extra },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  let json: any = raw;
  try {
    json = JSON.parse(raw);
  } catch {
    /* empty body */
  }
  return { status: res.status, json, headers: res.headers };
}

let nextId = 1;
const call = (token: string, name: string, args: Record<string, unknown> = {}) =>
  rpc(token, { jsonrpc: "2.0", id: nextId++, method: "tools/call", params: { name, arguments: args } });

/** A tool call that must come back as a normal result: its text and whether it is a tool error. */
async function tool(token: string, name: string, args: Record<string, unknown> = {}) {
  const r = await call(token, name, args);
  expect(r.status, JSON.stringify(r.json)).toBe(200);
  expect(r.json.error, JSON.stringify(r.json)).toBeUndefined();
  return { text: r.json.result.content[0].text as string, isError: r.json.result.isError === true };
}

async function tokenFor(c: Client): Promise<string> {
  const r = await c.call("POST", "/api/me/token");
  expect(r.status).toBe(200);
  return secret(r.body.token);
}

const mkNote = async (c: Client, boardId: number, body: Record<string, unknown> = {}) =>
  (await c.call("POST", `/api/boards/${boardId}/notes`, { text: "a note", x: 5000, y: 5000, ...body })).body.note;

const mkSection = async (c: Client, boardId: number, body: Record<string, unknown> = {}) =>
  (await c.call("POST", `/api/boards/${boardId}/sections`, { name: "Later", x: 0, y: 0, w: 700, h: 400, ...body })).body.section;

async function setup(prefix = "a") {
  const a = await signup(prefix);
  const { board } = await boardOf(a, a.username);
  return { a, board, token: await tokenFor(a) };
}

const noteIds = (text: string) => [...text.matchAll(/#(\d+)/g)].map((m) => Number(m[1]));
const overlap = (p: { x: number; y: number }, q: { x: number; y: number }) => p.x < q.x + NOTE_W && p.x + NOTE_W > q.x && p.y < q.y + NOTE_H && p.y + NOTE_H > q.y;

describe("token REST", () => {
  it("has no token until one is made, and never returns the token after", async () => {
    const a = await signup("a");
    expect((await a.call("GET", "/api/me/token")).body).toEqual({ exists: false, created_at: null, last_used_at: null });
    const made = await a.call("POST", "/api/me/token");
    expect(made.status).toBe(200);
    expect(made.body.token).toMatch(/^pi_[A-Za-z0-9_-]{32,}$/);
    secret(made.body.token);
    const info = await a.call("GET", "/api/me/token");
    expect(info.body.exists).toBe(true);
    expect(typeof info.body.created_at).toBe("number");
    expect(info.body.last_used_at).toBeNull();
    expect(JSON.stringify(info.body)).not.toContain(made.body.token);
  });

  it("replaces the old token when a new one is made, and DELETE answers 204", async () => {
    const a = await signup("a");
    const first = await tokenFor(a);
    const second = await tokenFor(a);
    expect(second).not.toBe(first);
    expect((await call(first, "read_board")).status).toBe(401);
    expect((await call(second, "read_board")).status).toBe(200);
    expect((await a.call("DELETE", "/api/me/token")).status).toBe(204);
    expect((await a.call("GET", "/api/me/token")).body.exists).toBe(false);
  });

  it("needs a cookie session: a bearer token can't reach /api routes", async () => {
    const { token } = await setup();
    for (const [method, path] of [["GET", "/api/me/token"], ["POST", "/api/me/token"], ["GET", "/api/me"]] as const) {
      const res = await fetch(new URL(path, baseUrl), { method, headers: { authorization: `Bearer ${token}` } });
      expect(res.status, `${method} ${path}`).toBe(401);
    }
  });

  it("refuses a cross-site POST to make a token", async () => {
    const a = await signup("a");
    const res = await fetch(new URL("/api/me/token", baseUrl), { method: "POST", headers: { cookie: a.cookie, origin: "https://evil.example" } });
    expect(res.status).toBe(403);
  });

  it("records last_used_at when the token is used", async () => {
    const { a, token } = await setup();
    await call(token, "read_board");
    expect(typeof (await a.call("GET", "/api/me/token")).body.last_used_at).toBe("number");
  });
});

describe("auth on /mcp", () => {
  const ping = { jsonrpc: "2.0", id: 1, method: "ping" };

  it("answers 401 with a JSON-RPC error and WWW-Authenticate for no token or a garbage one", async () => {
    const none = await rpc(null, ping);
    expect(none.status).toBe(401);
    expect(none.json.error.message).toBeTruthy();
    expect(none.headers.get("www-authenticate")).toMatch(/^Bearer/);
    for (const bad of ["garbage", "pi_" + "x".repeat(40)]) {
      const r = await rpc(bad, ping);
      expect(r.status, bad).toBe(401);
      expect(r.json.jsonrpc).toBe("2.0");
    }
    const wrongScheme = await rpc(null, ping, { authorization: "Basic abc" });
    expect(wrongScheme.status).toBe(401);
  });

  it("a bad bearer header fails even when a valid cookie is sent too", async () => {
    const a = await signup("a");
    const r = await rpc(null, ping, { authorization: "Bearer nope", cookie: a.cookie });
    expect(r.status).toBe(401);
    expect((await rpc(null, ping, { cookie: a.cookie })).status).toBe(200); // the cookie alone is fine
  });

  it("401s on the next call after revoke, regenerate or a password change", async () => {
    const a = await signup("a");
    const t1 = await tokenFor(a);
    expect((await rpc(t1, ping)).status).toBe(200);
    await a.call("DELETE", "/api/me/token");
    expect((await rpc(t1, ping)).status).toBe(401);

    const t2 = await tokenFor(a);
    const t3 = await tokenFor(a);
    expect((await rpc(t2, ping)).status).toBe(401);
    expect((await rpc(t3, ping)).status).toBe(200);

    const changed = await a.call("POST", "/api/me/password", { current: a.password, password: secret("a-new-password-1") });
    expect(changed.status).toBe(200);
    expect((await rpc(t3, ping)).status).toBe(401);
    // and the account has no token row left: GET with a fresh login says so
    const again = await login(a.username, "a-new-password-1");
    expect((await again.call("GET", "/api/me/token")).body.exists).toBe(false);
  });
});

describe("protocol", () => {
  it("answers GET with 405, and refuses a cross-site Origin", async () => {
    const { token } = await setup();
    const get = await fetch(new URL("/mcp", baseUrl), { headers: { authorization: `Bearer ${token}` } });
    expect(get.status).toBe(405);
    const evil = await rpc(token, { jsonrpc: "2.0", id: 1, method: "ping" }, { origin: "https://evil.example" });
    expect(evil.status).toBe(403);
  });

  it("initialize echoes a supported version, falls back to the latest otherwise, and lists tools capability", async () => {
    const { token } = await setup();
    for (const v of ["2025-03-26", "2025-06-18", "2025-11-25", "2026-07-28"]) {
      const r = await rpc(token, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: v, capabilities: {}, clientInfo: { name: "t", version: "1" } } });
      expect(r.json.result.protocolVersion).toBe(v);
      expect(r.json.result.capabilities.tools).toBeDefined();
      expect(r.json.result.serverInfo.name).toBe("post-its");
    }
    const odd = await rpc(token, { jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "1999-01-01" } });
    expect(odd.json.result.protocolVersion).toBe("2026-07-28");
  });

  it("a notification gets 202 and no body; ping gets {}", async () => {
    const { token } = await setup();
    const n = await rpc(token, { jsonrpc: "2.0", method: "notifications/initialized" });
    expect(n.status).toBe(202);
    expect((await rpc(token, { jsonrpc: "2.0", id: 9, method: "ping" })).json).toEqual({ jsonrpc: "2.0", id: 9, result: {} });
  });

  it("tools/list names exactly the eight tools, each with an input schema", async () => {
    const { token } = await setup();
    const r = await rpc(token, { jsonrpc: "2.0", id: 1, method: "tools/list" });
    const tools = r.json.result.tools as { name: string; inputSchema: { type: string } }[];
    expect(tools.map((t) => t.name).sort()).toEqual(["add_notes", "comment_on_note", "delete_notes", "edit_note", "find_notes", "move_notes_to_section", "read_board", "set_status"]);
    for (const t of tools) expect(t.inputSchema.type).toBe("object");
  });

  it("returns JSON-RPC errors for an unknown method, an unknown tool, bad JSON and a bad envelope", async () => {
    const { token } = await setup();
    expect((await rpc(token, { jsonrpc: "2.0", id: 1, method: "nope" })).json.error.code).toBe(-32601);
    expect((await call(token, "no_such_tool")).json.error.code).toBe(-32602);
    expect((await rpc(token, { id: 1, method: "ping" })).json.error.code).toBe(-32600);
    const bad = await fetch(new URL("/mcp", baseUrl), { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: "{not json" });
    expect(bad.status).toBe(400);
    expect((await bad.json()).error.code).toBe(-32700);
  });

  it("caps the body at 64 KB", async () => {
    const { token } = await setup();
    const big = await fetch(new URL("/mcp", baseUrl), {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping", pad: "x".repeat(70 * 1024) }),
    });
    expect(big.status).toBe(413);
  });

  it("answers the 61st call in a minute with JSON-RPC error -32029 (rate limited)", async () => {
    const { token } = await setup();
    let limited: any = null;
    for (let i = 0; i < 61; i++) {
      const r = await rpc(token, { jsonrpc: "2.0", id: i + 1, method: "ping" });
      if (r.json.error?.code === -32029) {
        limited = r;
        break;
      }
    }
    expect(limited, "never rate limited").not.toBeNull();
    expect(limited.json.error.message).toContain("rate limited");
    expect(limited.status).toBe(429);
    // the limit is per person: someone else is unaffected
    const other = await setup("b");
    expect((await rpc(other.token, { jsonrpc: "2.0", id: 1, method: "ping" })).status).toBe(200);
  });
});

describe("read_board and find_notes", () => {
  it("summarises counts by status and groups notes by section, with the id and status on each line", async () => {
    const { a, board, token } = await setup();
    const later = await mkSection(a, board.id, { name: "Later", x: 0, y: 0 });
    const now = await mkSection(a, board.id, { name: "Now", x: 800, y: 0 });
    const inLater = await mkNote(a, board.id, { text: "write spec", x: 100, y: 100 });
    const inNow = await mkNote(a, board.id, { text: "ship it", x: 900, y: 100 });
    const loose = await mkNote(a, board.id, { text: "somewhere else", x: 3000, y: 3000 });
    await a.call("PUT", `/api/notes/${inNow.id}/status`, { status: "done" });
    await a.call("PUT", `/api/notes/${inLater.id}/status`, { status: "progress" });

    const { text, isError } = await tool(token, "read_board");
    expect(isError).toBe(false);
    expect(text.split("\n")[0]).toContain("3 notes (1 none, 1 on progress, 1 done), 2 sections");
    const laterBlock = text.slice(text.indexOf("## Later"), text.indexOf("## Now"));
    expect(laterBlock).toContain(`- [on progress] #${inLater.id} write spec`);
    expect(text.slice(text.indexOf("## Now"), text.indexOf("## Not in a section"))).toContain(`- [done] #${inNow.id} ship it`);
    expect(text.slice(text.indexOf("## Not in a section"))).toContain(`- [none] #${loose.id} somewhere else`);
    expect(later.id).not.toBe(now.id);
  });

  it("with no sections, everything is under 'Not in a section'; with none of them, no such block", async () => {
    const { a, board, token } = await setup();
    expect((await tool(token, "read_board")).text).not.toContain("Not in a section");
    await mkNote(a, board.id, { text: "loose" });
    const t = (await tool(token, "read_board")).text;
    expect(t).toContain("0 sections");
    expect(t).toContain("## Not in a section");
  });

  it("find_notes filters by text, status and section, and the filters combine", async () => {
    const { a, board, token } = await setup();
    await mkSection(a, board.id, { name: "Later", x: 0, y: 0 });
    const one = await mkNote(a, board.id, { text: "Buy milk", x: 100, y: 100 });
    const two = await mkNote(a, board.id, { text: "Buy bread", x: 400, y: 100 });
    const three = await mkNote(a, board.id, { text: "Call mum", x: 3000, y: 3000 });
    await a.call("PUT", `/api/notes/${two.id}/status`, { status: "done" });

    expect(noteIds((await tool(token, "find_notes", { text: "buy" })).text).sort()).toEqual([one.id, two.id].sort());
    expect(noteIds((await tool(token, "find_notes", { status: "done" })).text)).toEqual([two.id]);
    expect(noteIds((await tool(token, "find_notes", { section: "later" })).text).sort()).toEqual([one.id, two.id].sort());
    expect(noteIds((await tool(token, "find_notes", { section: "Later", status: "none" })).text)).toEqual([one.id]);
    expect((await tool(token, "find_notes", { text: "zzz" })).text).toContain("No notes");
    expect(three.id).toBeGreaterThan(0);
    expect((await tool(token, "find_notes", { section: "Nope" })).isError).toBe(true);
    expect((await tool(token, "find_notes", { status: "finished" })).isError).toBe(true);
  });

  it("says who wrote a note and its colour when it isn't the person's own", async () => {
    const { a, board } = await setup("a");
    const visitor = await signup("v");
    const theirs = await mkNote(visitor, board.id, { text: "from a visitor", color: "blue", x: 50, y: 50 });
    const t = (await tool(await tokenFor(a), "read_board")).text;
    expect(t).toContain(`#${theirs.id} (blue, by ${visitor.username}) from a visitor`);
  });

  it("reads a visited board and a channel by name, and says so when the channel isn't joined", async () => {
    const { a, board, token } = await setup("a");
    await mkNote(a, board.id, { text: "public one" });
    const v = await signup("v");
    const vt = await tokenFor(v);
    expect((await tool(vt, "read_board", { board: a.username })).text).toContain("public one");

    const slug = (await a.call("POST", "/api/channels", { name: `chan${Date.now()}`, visibility: "key", key: secret("sesame-key-1") })).body.board.slug;
    const denied = await tool(vt, "read_board", { board: `#${slug}` });
    expect(denied.isError).toBe(true);
    expect(denied.text).toContain("not a member");
    expect((await tool(token, "read_board", { board: `#${slug}` })).isError).toBe(false);
    expect((await tool(token, "read_board", { board: "#no-such-channel" })).isError).toBe(true);
    expect((await tool(token, "read_board", { board: "nobody-here-xyz" })).isError).toBe(true);
  });
});

describe("set_status", () => {
  it("moves a note through the three states and the status persists", async () => {
    const { a, board, token } = await setup();
    const n = await mkNote(a, board.id);
    for (const [status, stored] of [["on progress", "progress"], ["done", "done"], ["none", null]] as const) {
      const r = await tool(token, "set_status", { note_id: n.id, status });
      expect(r.isError).toBe(false);
      const got = (await boardOf(a, a.username)).notes.find((x: any) => x.id === n.id);
      expect(got.myStatus).toBe(stored);
    }
  });

  it("rejects a bad status or note id as a tool error, and a note that doesn't exist", async () => {
    const { a, board, token } = await setup();
    const n = await mkNote(a, board.id);
    expect((await tool(token, "set_status", { note_id: n.id, status: "progress" })).isError).toBe(true);
    expect((await tool(token, "set_status", { note_id: "x", status: "done" })).isError).toBe(true);
    const gone = await tool(token, "set_status", { note_id: 99999999, status: "done" });
    expect(gone.isError).toBe(true);
    expect(gone.text).toContain("No such note");
  });

  it("a second browser sees the change live with an agent:touch naming the person; a reload still has it", async () => {
    const { a, board, token } = await setup("a");
    const n = await mkNote(a, board.id);
    const watcher = await signup("w");
    const live = await connect(watcher, board.id);
    await tool(token, "set_status", { note_id: n.id, status: "done" });
    const side = await live.next((m) => m.type === "note:side" && m.id === n.id);
    expect(side.summary).toBeDefined();
    const touch = await live.next((m) => m.type === "agent:touch" && m.noteId === n.id);
    expect(touch.by).toBe(a.username);
    expect((await boardOf(a, a.username)).notes.find((x: any) => x.id === n.id).myStatus).toBe("done");
    await live.close();
  });

  it("names nobody in agent:touch when the person is anonymous", async () => {
    const { a, board, token } = await setup("a");
    await a.call("PATCH", "/api/me", { anonymous: true });
    const n = await mkNote(a, board.id);
    const watcher = await signup("w");
    const live = await connect(watcher, board.id);
    await tool(token, "set_status", { note_id: n.id, status: "done" });
    expect((await live.next((m) => m.type === "agent:touch")).by).toBeNull();
    await live.close();
  });

  it("an agent:touch only reaches viewers who can see the note (a private note stays private)", async () => {
    const { a, board, token } = await setup("a");
    const n = await mkNote(a, board.id, { visibility: "private" });
    const watcher = await signup("w");
    const live = await connect(watcher, board.id);
    const owner = await connect(a, board.id);
    await tool(token, "set_status", { note_id: n.id, status: "done" });
    await owner.next((m) => m.type === "agent:touch" && m.noteId === n.id);
    // give the watcher's socket time to show anything it was wrongly sent
    await new Promise((r) => setTimeout(r, 300));
    expect(live.messages.some((m) => m.type === "agent:touch" || m.type === "note:side")).toBe(false);
    await live.close();
    await owner.close();
  });
});

describe("add_notes", () => {
  it("puts three notes inside Later's zone, clear of each other and of existing notes", async () => {
    const { a, board, token } = await setup();
    const later = await mkSection(a, board.id, { name: "Later", x: 100, y: 100, w: 700, h: 400 });
    const existing = await mkNote(a, board.id, { text: "already here", x: later.x + 10, y: later.y + 40 });

    const r = await tool(token, "add_notes", { notes: [{ text: "one", section: "Later" }, { text: "two", section: "later" }, { text: "three", section: "Later", color: "green" }] });
    expect(r.isError, r.text).toBe(false);
    const ids = noteIds(r.text);
    expect(ids).toHaveLength(3);

    const notes = (await boardOf(a, a.username)).notes as any[];
    const added = notes.filter((n) => ids.includes(n.id));
    expect(added.map((n) => n.color).sort()).toEqual(["green", "yellow", "yellow"]);
    const everyone = [...added, notes.find((n) => n.id === existing.id)];
    for (const n of added) {
      // its centre is in the zone, and the whole note sits below the name bar
      expect(n.x + NOTE_W / 2).toBeGreaterThanOrEqual(later.x);
      expect(n.x + NOTE_W).toBeLessThanOrEqual(later.x + later.w);
      expect(n.y).toBeGreaterThanOrEqual(later.y + 30);
      expect(n.y + NOTE_H).toBeLessThanOrEqual(later.y + later.h);
    }
    for (let i = 0; i < everyone.length; i++) {
      for (let j = i + 1; j < everyone.length; j++) expect(overlap(everyone[i], everyone[j]), `notes ${i} and ${j} overlap`).toBe(false);
    }
    // and read_board files them under Later
    const laterBlock = (await tool(token, "read_board")).text.split("\n\n").find((b) => b.startsWith("## Later"))!;
    expect(noteIds(laterBlock).sort()).toEqual([existing.id, ...ids].sort());
  });

  it("an unknown section is a tool error that lists the real sections, and nothing is added", async () => {
    const { a, board, token } = await setup();
    await mkSection(a, board.id, { name: "Later", x: 0, y: 0 });
    await mkSection(a, board.id, { name: "Now", x: 800, y: 0 });
    const r = await tool(token, "add_notes", { notes: [{ text: "ok", section: "Later" }, { text: "bad", section: "Someday" }] });
    expect(r.isError).toBe(true);
    expect(r.text).toContain('"Later"');
    expect(r.text).toContain('"Now"');
    expect((await boardOf(a, a.username)).notes).toHaveLength(0);
  });

  it("a section too small or full is a tool error naming it, and nothing is added", async () => {
    const { a, board, token } = await setup();
    await mkSection(a, board.id, { name: "Tiny", x: 0, y: 0, w: 150, h: 120 });
    const tiny = await tool(token, "add_notes", { notes: [{ text: "x", section: "Tiny" }] });
    expect(tiny.isError).toBe(true);
    expect(tiny.text).toContain("too small");

    await mkSection(a, board.id, { name: "Tight", x: 1000, y: 0, w: 260, h: 230 }); // room for exactly one note
    expect((await tool(token, "add_notes", { notes: [{ text: "fits", section: "Tight" }] })).isError).toBe(false);
    const full = await tool(token, "add_notes", { notes: [{ text: "no room", section: "Tight" }] });
    expect(full.isError).toBe(true);
    expect(full.text).toContain("no free space");
    expect((await boardOf(a, a.username)).notes).toHaveLength(1);
  });

  it("with no section the notes land near the top-left, clear of each other, existing notes and zones", async () => {
    const { a, board, token } = await setup();
    const zone = await mkSection(a, board.id, { name: "Z", x: 0, y: 0, w: 300, h: 300 });
    const r = await tool(token, "add_notes", { notes: [{ text: "a" }, { text: "b" }, { text: "c" }] });
    expect(r.isError, r.text).toBe(false);
    const added = (await boardOf(a, a.username)).notes as any[];
    expect(added).toHaveLength(3);
    for (const n of added) {
      expect(n.x).toBeLessThan(2000);
      expect(n.y).toBeLessThan(2000);
      const touchesZone = n.x < zone.x + zone.w && n.x + NOTE_W > zone.x && n.y < zone.y + zone.h && n.y + NOTE_H > zone.y;
      expect(touchesZone, "a note with no section must stay out of zones").toBe(false);
    }
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) expect(overlap(added[i], added[j])).toBe(false);
  });

  it("validates the batch: 1 to 20 notes, text present and at most 280, a known colour", async () => {
    const { token } = await setup();
    expect((await tool(token, "add_notes", { notes: [] })).isError).toBe(true);
    expect((await tool(token, "add_notes", { notes: Array.from({ length: 21 }, () => ({ text: "x" })) })).isError).toBe(true);
    expect((await tool(token, "add_notes", { notes: [{ text: "" }] })).isError).toBe(true);
    expect((await tool(token, "add_notes", { notes: [{ text: "x".repeat(281) }] })).isError).toBe(true);
    expect((await tool(token, "add_notes", { notes: [{ text: "x", color: "chartreuse" }] })).isError).toBe(true);
    expect((await tool(token, "add_notes", { notes: ["not an object"] })).isError).toBe(true);
    expect((await tool(token, "add_notes", {})).isError).toBe(true);
    expect((await tool(token, "add_notes", { notes: Array.from({ length: 20 }, (_, i) => ({ text: `n${i}` })) })).isError).toBe(false);
  });

  it("adds to a channel the person belongs to, as a member, and a visitor's note on someone's board is the visitor's", async () => {
    const { a, board } = await setup("a");
    const v = await signup("v");
    const vt = await tokenFor(v);
    await tool(vt, "add_notes", { board: a.username, notes: [{ text: "from my agent" }] });
    const seen = (await boardOf(a, a.username)).notes.find((n: any) => n.text === "from my agent");
    expect(seen.author).toBe(v.username);
    expect(board.id).toBeGreaterThan(0);

    const slug = (await a.call("POST", "/api/channels", { name: `ch${Date.now()}`, visibility: "public" })).body.board.slug;
    const joined = await v.call("GET", `/api/boards/channel/${slug}`);
    expect(joined.status).toBe(200);
    expect((await tool(vt, "add_notes", { board: `#${slug}`, notes: [{ text: "chan note" }] })).isError).toBe(false);
  });

  it("broadcasts note:upsert and an agent:touch for each note to viewers", async () => {
    const { board, token, a } = await setup("a");
    const watcher = await signup("w");
    const live = await connect(watcher, board.id);
    const r = await tool(token, "add_notes", { notes: [{ text: "live one" }, { text: "live two" }] });
    for (const id of noteIds(r.text)) {
      await live.next((m) => m.type === "note:upsert" && m.note.id === id);
      expect((await live.next((m) => m.type === "agent:touch" && m.noteId === id)).by).toBe(a.username);
    }
    await live.close();
  });
});

describe("move_notes_to_section, edit_note, comment_on_note", () => {
  it("moves notes into the section's free spots without overlap, and reports each", async () => {
    const { a, board, token } = await setup();
    const zone = await mkSection(a, board.id, { name: "Done", x: 0, y: 0, w: 700, h: 400 });
    const n1 = await mkNote(a, board.id, { text: "one", x: 3000, y: 3000 });
    const n2 = await mkNote(a, board.id, { text: "two", x: 3300, y: 3000 });
    const r = await tool(token, "move_notes_to_section", { note_ids: [n1.id, n2.id], section: "done" });
    expect(r.isError, r.text).toBe(false);
    const notes = (await boardOf(a, a.username)).notes as any[];
    const [m1, m2] = [n1, n2].map((n) => notes.find((x) => x.id === n.id));
    for (const m of [m1, m2]) {
      expect(m.x + NOTE_W).toBeLessThanOrEqual(zone.x + zone.w);
      expect(m.y).toBeGreaterThanOrEqual(zone.y + 30);
      expect(m.y + NOTE_H).toBeLessThanOrEqual(zone.y + zone.h);
    }
    expect(overlap(m1, m2)).toBe(false);
    // asking again says they're already there and moves nothing
    const again = await tool(token, "move_notes_to_section", { note_ids: [n1.id], section: "Done" });
    expect(again.text).toContain("already in");
    expect((await boardOf(a, a.username)).notes.find((x: any) => x.id === n1.id).x).toBe(m1.x);
  });

  it("an unknown section is a tool error listing the sections", async () => {
    const { a, board, token } = await setup();
    await mkSection(a, board.id, { name: "Done" });
    const n = await mkNote(a, board.id);
    const r = await tool(token, "move_notes_to_section", { note_ids: [n.id], section: "Nope" });
    expect(r.isError).toBe(true);
    expect(r.text).toContain('"Done"');
  });

  it("edit_note rewrites text and refuses text over 280; comment_on_note posts as the person", async () => {
    const { a, board, token } = await setup();
    const n = await mkNote(a, board.id, { text: "before" });
    expect((await tool(token, "edit_note", { note_id: n.id, text: "after" })).isError).toBe(false);
    expect((await boardOf(a, a.username)).notes.find((x: any) => x.id === n.id).text).toBe("after");
    expect((await tool(token, "edit_note", { note_id: n.id, text: "x".repeat(281) })).isError).toBe(true);
    expect((await tool(token, "edit_note", { note_id: n.id })).isError).toBe(true);

    expect((await tool(token, "comment_on_note", { note_id: n.id, text: "looks good" })).isError).toBe(false);
    const side = (await a.call("GET", `/api/notes/${n.id}/side`)).body;
    expect(side.comments.map((c: any) => [c.author, c.text])).toEqual([[a.username, "looks good"]]);
    expect((await tool(token, "comment_on_note", { note_id: n.id, text: "  " })).isError).toBe(true);
    expect((await tool(token, "comment_on_note", { note_id: n.id, text: "x".repeat(501) })).isError).toBe(true);
  });
});

describe("delete_notes", () => {
  it("deletes only when the text matches exactly, lists each note, and the board updates live", async () => {
    const { a, board, token } = await setup();
    const keep = await mkNote(a, board.id, { text: "keep me" });
    const drop = await mkNote(a, board.id, { text: "drop me" });
    const watcher = await signup("w");
    const live = await connect(watcher, board.id);

    const stale = await tool(token, "delete_notes", { notes: [{ id: drop.id, text: "drop" }, { id: keep.id, text: "KEEP ME" }] });
    expect(stale.isError).toBe(true);
    expect(stale.text).toContain(`#${drop.id} skipped`);
    expect(stale.text).toContain(`#${keep.id} skipped`);
    expect((await boardOf(a, a.username)).notes).toHaveLength(2);

    const mixed = await tool(token, "delete_notes", { notes: [{ id: drop.id, text: "drop me" }, { id: keep.id, text: "wrong" }] });
    expect(mixed.isError).toBe(false);
    expect(mixed.text).toContain(`#${drop.id} deleted`);
    expect(mixed.text).toContain(`#${keep.id} skipped`);
    expect((await live.next((m) => m.type === "note:delete" && m.id === drop.id)).id).toBe(drop.id);
    expect((await boardOf(a, a.username)).notes.map((n: any) => n.id)).toEqual([keep.id]);
    await live.close();
  });

  it("skips a note that doesn't exist and rejects a malformed request", async () => {
    const { token } = await setup();
    const gone = await tool(token, "delete_notes", { notes: [{ id: 99999999, text: "x" }] });
    expect(gone.isError).toBe(true);
    expect(gone.text).toContain("skipped");
    expect((await tool(token, "delete_notes", { notes: [] })).isError).toBe(true);
    expect((await tool(token, "delete_notes", { notes: [{ id: 1 }] })).isError).toBe(true);
    expect((await tool(token, "delete_notes", {})).isError).toBe(true);
  });
});

describe("a token can do nothing its login couldn't", () => {
  async function twoUsers() {
    const a = await signup("a");
    const b = await signup("b");
    const { board } = await boardOf(a, a.username);
    return { a, b, board, bt: await tokenFor(b), at: await tokenFor(a) };
  }

  it("B's token can't read A's private notes, and finds nothing of them either", async () => {
    const { a, board, bt } = await twoUsers();
    const priv = await mkNote(a, board.id, { text: "A's private secret", visibility: "private" });
    const pub = await mkNote(a, board.id, { text: "A's public one" });
    const read = (await tool(bt, "read_board", { board: a.username })).text;
    expect(read).not.toContain("private secret");
    expect(read).not.toContain(`#${priv.id} `);
    expect(read).toContain(`#${pub.id} `);
    expect((await tool(bt, "find_notes", { board: a.username, text: "secret" })).text).not.toContain("private secret");
    // the owner's own agent does see it
    expect((await tool(await tokenFor(a), "read_board")).text).toContain("A's private secret");
  });

  it("B's token can't edit, set status on, comment on or delete A's notes on A's board", async () => {
    const { a, board, bt } = await twoUsers();
    const pub = await mkNote(a, board.id, { text: "A's note" });
    const priv = await mkNote(a, board.id, { text: "A's private", visibility: "private" });

    const edit = await tool(bt, "edit_note", { note_id: pub.id, text: "hacked" });
    expect(edit.isError).toBe(true);
    expect(edit.text).toContain("only edit your own");
    expect((await tool(bt, "edit_note", { note_id: priv.id, text: "hacked" })).text).toContain("No such note");

    // a status is the person's own and may be set on any note they can see, but not one they can't
    expect((await tool(bt, "set_status", { note_id: priv.id, status: "done" })).isError).toBe(true);
    expect((await tool(bt, "set_status", { note_id: pub.id, status: "done" })).isError).toBe(false);
    expect((await boardOf(a, a.username)).notes.find((n: any) => n.id === pub.id).myStatus).toBeNull(); // A's own status is untouched

    expect((await tool(bt, "comment_on_note", { note_id: priv.id, text: "hi" })).isError).toBe(true);

    const del = await tool(bt, "delete_notes", { notes: [{ id: pub.id, text: "A's note" }, { id: priv.id, text: "A's private" }] });
    expect(del.isError).toBe(true);
    expect(del.text).toContain("only delete your own");
    const left = (await boardOf(a, a.username)).notes as any[];
    expect(left.map((n) => n.text).sort()).toEqual(["A's note", "A's private"]);
  });

  it("B can't read the text of a private note through a delete mismatch", async () => {
    const { a, board, bt } = await twoUsers();
    const priv = await mkNote(a, board.id, { text: "private words", visibility: "private" });
    const r = await tool(bt, "delete_notes", { notes: [{ id: priv.id, text: "guess" }] });
    expect(r.text).not.toContain("private words");
  });

  it("B can't move a note that isn't theirs on a visited board, but can move their own", async () => {
    const { a, b, board, bt } = await twoUsers();
    await mkSection(a, board.id, { name: "Inbox", x: 0, y: 0 });
    const theirs = await mkNote(a, board.id, { text: "A's", x: 3000, y: 3000 });
    const mine = await mkNote(b, board.id, { text: "B's", x: 3300, y: 3000 });

    const denied = await tool(bt, "move_notes_to_section", { board: a.username, note_ids: [theirs.id], section: "Inbox" });
    expect(denied.isError).toBe(true);
    expect(denied.text).toContain("only move your own");
    expect((await boardOf(a, a.username)).notes.find((n: any) => n.id === theirs.id).x).toBe(3000);

    const mixed = await tool(bt, "move_notes_to_section", { board: a.username, note_ids: [theirs.id, mine.id], section: "Inbox" });
    expect(mixed.isError).toBe(false);
    expect(mixed.text).toContain(`#${theirs.id} skipped`);
    expect(mixed.text).toContain(`#${mine.id} moved`);
  });

  it("a visitor's agent can't edit sections (there is no tool for it) and add_notes into a missing section fails", async () => {
    const { a, board, bt } = await twoUsers();
    await mkSection(a, board.id, { name: "Inbox", x: 0, y: 0 });
    const tools = (await rpc(bt, { jsonrpc: "2.0", id: 1, method: "tools/list" })).json.result.tools.map((t: any) => t.name);
    expect(tools.some((n: string) => /section/.test(n) && n !== "move_notes_to_section")).toBe(false);
    expect((await tool(bt, "add_notes", { board: a.username, notes: [{ text: "x", section: "Nope" }] })).isError).toBe(true);
  });

  it("B can't act on a channel they haven't joined", async () => {
    const { a, bt } = await twoUsers();
    const slug = (await a.call("POST", "/api/channels", { name: `sec${Date.now()}`, visibility: "key", key: secret("another-key-12") })).body.board.slug;
    for (const [name, args] of [["read_board", { board: `#${slug}` }], ["add_notes", { board: `#${slug}`, notes: [{ text: "x" }] }], ["find_notes", { board: `#${slug}` }]] as const) {
      const r = await tool(bt, name, args as Record<string, unknown>);
      expect(r.isError, name).toBe(true);
    }
  });
});

describe("the setup message", () => {
  it("names the page's own origin, never a hard-coded host", () => {
    const prod = "https://comp4020-final-edwarbudiman.fly.dev";
    const msg = setupMessage(prod, "pi_exampletoken");
    expect(mcpUrl(prod)).toBe("https://comp4020-final-edwarbudiman.fly.dev/mcp");
    expect(msg).toContain(`claude mcp add --transport http postits ${prod}/mcp --header "Authorization: Bearer pi_exampletoken"`);
    expect(msg).toContain("read_board");

    const other = setupMessage("http://localhost:8120", "pi_x");
    expect(other).toContain("http://localhost:8120/mcp");
    expect(other).not.toContain("fly.dev");
    expect(setupMessage("https://example.org/", "pi_x")).toContain("https://example.org/mcp");
    // nothing else in the string carries a host
    expect(msg.replaceAll(prod, "").match(/https?:\/\/[^\s"]+/g)).toBeNull();
  });
});
