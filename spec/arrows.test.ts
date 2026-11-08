import { describe, expect, it } from "vitest";
import { boardOf, connect, signup } from "./helpers.ts";
import type { Client } from "./helpers.ts";

// note-arrows: owner-only one-way arrows between notes on a user board.

async function setup() {
  const [a, v] = [await signup("a"), await signup("v")];
  const { board } = await boardOf(a, a.username);
  const note = async (c: Client, x: number, extra: Record<string, unknown> = {}) =>
    (await c.call("POST", `/api/boards/${board.id}/notes`, { text: `n${x}`, x, y: 0, ...extra })).body.note;
  const [n1, n2, n3] = [await note(a, 0), await note(a, 300), await note(a, 600)];
  const arrow = (from: number, to: number, extra: Record<string, unknown> = {}, c: Client = a) =>
    c.call("POST", `/api/boards/${board.id}/arrows`, { from, to, ...extra });
  return { a, v, board, n1, n2, n3, note, arrow };
}

const arrowsOf = async (c: Client, owner: string) => ((await c.call("GET", `/api/boards/user/${owner}`)).body.arrows as any[]);

describe("arrows: create", () => {
  it("creates an arrow with and without anchors, and it comes back on load", async () => {
    const { a, n1, n2, n3, arrow } = await setup();
    const plain = await arrow(n1.id, n2.id);
    expect(plain.status).toBe(201);
    expect(plain.body.arrow).toMatchObject({ from: n1.id, to: n2.id, fromSide: null, fromT: null, toSide: null, toT: null, color: null });
    const anchored = await arrow(n2.id, n3.id, { fromSide: "right", fromT: 0.25, toSide: "left", toT: 1, color: "pink" });
    expect(anchored.status).toBe(201);
    expect(anchored.body.arrow).toMatchObject({ fromSide: "right", fromT: 0.25, toSide: "left", toT: 1, color: "pink" });
    const loaded = await arrowsOf(a, a.username);
    expect(loaded.map((x) => x.id).sort()).toEqual([plain.body.arrow.id, anchored.body.arrow.id].sort());
  });

  it("answers a duplicate A→B with 200 and the existing arrow, while B→A is a separate arrow", async () => {
    const { n1, n2, arrow } = await setup();
    const first = await arrow(n1.id, n2.id);
    const again = await arrow(n1.id, n2.id, { fromSide: "top", fromT: 0.5, toSide: "top", toT: 0.5 });
    expect(again.status).toBe(200);
    expect(again.body.arrow.id).toBe(first.body.arrow.id);
    expect(again.body.arrow.fromSide).toBeNull(); // the existing one, unchanged
    const back = await arrow(n2.id, n1.id);
    expect(back.status).toBe(201);
    expect(back.body.arrow.id).not.toBe(first.body.arrow.id);
  });

  it("rejects a self-arrow, a bad anchor and a bad colour with 400", async () => {
    const { n1, n2, arrow } = await setup();
    expect((await arrow(n1.id, n1.id)).status).toBe(400);
    expect((await arrow(n1.id, n2.id, { fromSide: "middle", fromT: 0.5 })).status).toBe(400);
    expect((await arrow(n1.id, n2.id, { fromSide: "top", fromT: 1.5 })).status).toBe(400);
    expect((await arrow(n1.id, n2.id, { fromSide: "top", fromT: -0.1 })).status).toBe(400);
    expect((await arrow(n1.id, n2.id, { toSide: "left" })).status).toBe(400); // a side without a position
    expect((await arrow(n1.id, n2.id, { toT: 0.5 })).status).toBe(400); // a position without a side
    expect((await arrow(n1.id, n2.id, { color: "chartreuse" })).status).toBe(400);
    expect((await arrow("x" as any, n2.id)).status).toBe(400);
  });

  it("404s for an unknown board, an unknown note, a note on another board and a channel board", async () => {
    const { a, board, n1, arrow } = await setup();
    expect((await a.call("POST", `/api/boards/999999/arrows`, { from: n1.id, to: n1.id + 1 })).status).toBe(404);
    expect((await arrow(n1.id, 999999)).status).toBe(404);
    const other = await signup("o");
    const otherBoard = (await boardOf(other, other.username)).board;
    const foreign = (await other.call("POST", `/api/boards/${otherBoard.id}/notes`, { text: "x", x: 0, y: 0 })).body.note;
    expect((await arrow(n1.id, foreign.id)).status).toBe(404);

    const ch = await a.call("POST", "/api/channels", { name: "Arrows Chan " + Date.now() % 100000 });
    expect(ch.status).toBe(201);
    const chBoard = (await a.call("GET", `/api/boards/channel/${ch.body.board.slug}`)).body;
    const c1 = (await a.call("POST", `/api/boards/${chBoard.board.id}/notes`, { text: "1", x: 0, y: 0 })).body.note;
    const c2 = (await a.call("POST", `/api/boards/${chBoard.board.id}/notes`, { text: "2", x: 300, y: 0 })).body.note;
    expect((await a.call("POST", `/api/boards/${chBoard.board.id}/arrows`, { from: c1.id, to: c2.id })).status).toBe(404);
    expect(chBoard.arrows).toEqual([]);
    expect(board.id).not.toBe(chBoard.board.id);
  });
});

describe("arrows: update and delete", () => {
  it("moves an end along a border, and re-targets it", async () => {
    const { a, n1, n2, n3, arrow } = await setup();
    const { arrow: made } = (await arrow(n1.id, n2.id, { toSide: "left", toT: 0.5 })).body;
    const moved = await a.call("PATCH", `/api/arrows/${made.id}`, { toSide: "top", toT: 0.8 });
    expect(moved.status).toBe(200);
    expect(moved.body.arrow).toMatchObject({ to: n2.id, toSide: "top", toT: 0.8 });
    const retarget = await a.call("PATCH", `/api/arrows/${made.id}`, { to: n3.id, toSide: "bottom", toT: 0.1 });
    expect(retarget.body.arrow).toMatchObject({ from: n1.id, to: n3.id, toSide: "bottom", toT: 0.1 });
    const reload = (await arrowsOf(a, a.username)).find((x) => x.id === made.id);
    expect(reload).toMatchObject({ to: n3.id, toSide: "bottom", toT: 0.1 });
  });

  it("recolours an arrow and can set the colour back to the default", async () => {
    const { a, n1, n2, arrow } = await setup();
    const { arrow: made } = (await arrow(n1.id, n2.id)).body;
    const r = await a.call("PATCH", `/api/arrows/${made.id}`, { color: "green" });
    expect(r.body.arrow.color).toBe("green");
    expect((await arrowsOf(a, a.username))[0].color).toBe("green");
    expect((await a.call("PATCH", `/api/arrows/${made.id}`, { color: "nope" })).status).toBe(400);
    expect((await a.call("PATCH", `/api/arrows/${made.id}`, { color: null })).body.arrow.color).toBeNull();
  });

  it("refuses a PATCH that makes a self-arrow (400), a duplicate (409), a bad anchor (400), or nothing (400)", async () => {
    const { a, n1, n2, n3, arrow } = await setup();
    const ab = (await arrow(n1.id, n2.id)).body.arrow;
    await arrow(n1.id, n3.id);
    expect((await a.call("PATCH", `/api/arrows/${ab.id}`, { to: n1.id })).status).toBe(400);
    expect((await a.call("PATCH", `/api/arrows/${ab.id}`, { to: n3.id })).status).toBe(409);
    expect((await a.call("PATCH", `/api/arrows/${ab.id}`, { fromSide: "top", fromT: 2 })).status).toBe(400);
    expect((await a.call("PATCH", `/api/arrows/${ab.id}`, {})).status).toBe(400);
    expect((await a.call("PATCH", `/api/arrows/${ab.id}`, { to: 999999 })).status).toBe(404);
    expect((await a.call("PATCH", `/api/arrows/999999`, { color: "pink" })).status).toBe(404);
    // nothing changed
    expect((await arrowsOf(a, a.username)).find((x) => x.id === ab.id)).toMatchObject({ from: n1.id, to: n2.id });
  });

  it("deletes an arrow; a second delete is a 404", async () => {
    const { a, n1, n2, arrow } = await setup();
    const { arrow: made } = (await arrow(n1.id, n2.id)).body;
    expect((await a.call("DELETE", `/api/arrows/${made.id}`)).body).toEqual({ ok: true });
    expect(await arrowsOf(a, a.username)).toEqual([]);
    expect((await a.call("DELETE", `/api/arrows/${made.id}`)).status).toBe(404);
  });

  it("removes every arrow touching a note when the note is deleted", async () => {
    const { a, n1, n2, n3, arrow } = await setup();
    await arrow(n1.id, n2.id);
    await arrow(n3.id, n1.id);
    const keep = (await arrow(n2.id, n3.id)).body.arrow;
    expect((await a.call("DELETE", `/api/notes/${n1.id}`)).status).toBe(200);
    expect((await arrowsOf(a, a.username)).map((x) => x.id)).toEqual([keep.id]);
  });
});

describe("arrows: who may do what", () => {
  it("lets a visitor see the arrows but never create, change or delete them (403)", async () => {
    const { a, v, board, n1, n2, arrow } = await setup();
    const made = (await arrow(n1.id, n2.id)).body.arrow;
    expect((await arrowsOf(v, a.username)).map((x) => x.id)).toEqual([made.id]);
    expect((await arrow(n2.id, n1.id, {}, v)).status).toBe(403);
    expect((await v.call("PATCH", `/api/arrows/${made.id}`, { color: "pink" })).status).toBe(403);
    expect((await v.call("DELETE", `/api/arrows/${made.id}`)).status).toBe(403);
    expect((await arrowsOf(a, a.username))[0]).toMatchObject({ id: made.id, color: null });
    expect(board.kind).toBe("user");
  });

  it("never shows a visitor an arrow to a private note, on load or over the WebSocket", async () => {
    const { a, v, board, n1, n2, arrow, note } = await setup();
    const secret = await note(a, 900, { visibility: "private" });
    const visible = (await arrow(n1.id, n2.id)).body.arrow;
    const liveV = await connect(v, board.id);
    const liveA = await connect(a, board.id);
    try {
      const hidden = (await arrow(n1.id, secret.id)).body.arrow;
      // the owner is told, the visitor is told nothing about it
      await liveA.next((m) => m.type === "arrow:upsert" && m.arrow.id === hidden.id);
      expect((await arrowsOf(v, a.username)).map((x) => x.id)).toEqual([visible.id]);
      expect((await arrowsOf(a, a.username)).map((x) => x.id).sort()).toEqual([visible.id, hidden.id].sort());
      // a later public arrow reaches the visitor, so the earlier silence is real
      const pub = (await arrow(n2.id, n1.id)).body.arrow;
      await liveV.next((m) => m.type === "arrow:upsert" && m.arrow.id === pub.id);
      expect(JSON.stringify(liveV.messages)).not.toContain(`"id":${hidden.id},`);
      expect(liveV.messages.some((m) => m.type === "arrow:upsert" && m.arrow.id === hidden.id)).toBe(false);
      // and the visitor can't reach it by id either
      expect((await v.call("PATCH", `/api/arrows/${hidden.id}`, { color: "pink" })).status).toBe(404);
      expect((await v.call("DELETE", `/api/arrows/${hidden.id}`)).status).toBe(404);
    } finally {
      await liveV.close();
      await liveA.close();
    }
  });

  it("retracts a visitor's arrow when its note turns private, and brings it back when public again", async () => {
    const { a, v, board, n1, n2, arrow } = await setup();
    const made = (await arrow(n1.id, n2.id)).body.arrow;
    const liveV = await connect(v, board.id);
    try {
      await a.call("PATCH", `/api/notes/${n2.id}`, { visibility: "private" });
      await liveV.next((m) => m.type === "arrow:delete" && m.id === made.id);
      expect(await arrowsOf(v, a.username)).toEqual([]);
      await a.call("PATCH", `/api/notes/${n2.id}`, { visibility: "public" });
      const back = await liveV.next((m) => m.type === "arrow:upsert" && m.arrow.id === made.id);
      expect(back.arrow.to).toBe(n2.id);
    } finally {
      await liveV.close();
    }
  });

  it("re-targeting an arrow to a private note retracts it from a visitor", async () => {
    const { a, v, board, n1, n2, arrow, note } = await setup();
    const secret = await note(a, 900, { visibility: "private" });
    const made = (await arrow(n1.id, n2.id)).body.arrow;
    const liveV = await connect(v, board.id);
    try {
      await a.call("PATCH", `/api/arrows/${made.id}`, { to: secret.id });
      await liveV.next((m) => m.type === "arrow:delete" && m.id === made.id);
    } finally {
      await liveV.close();
    }
  });
});

describe("arrows: live", () => {
  it("sends arrow:upsert on create and update and arrow:delete on delete to a viewer", async () => {
    const { a, v, board, n1, n2, arrow } = await setup();
    const liveV = await connect(v, board.id);
    try {
      const made = (await arrow(n1.id, n2.id)).body.arrow;
      const created = await liveV.next((m) => m.type === "arrow:upsert" && m.arrow.id === made.id);
      expect(created.arrow).toMatchObject({ from: n1.id, to: n2.id, color: null });

      await a.call("PATCH", `/api/arrows/${made.id}`, { color: "blue", toSide: "bottom", toT: 0.3 });
      const updated = await liveV.next((m) => m.type === "arrow:upsert" && m.arrow.color === "blue");
      expect(updated.arrow).toMatchObject({ toSide: "bottom", toT: 0.3 });

      await a.call("DELETE", `/api/arrows/${made.id}`);
      await liveV.next((m) => m.type === "arrow:delete" && m.id === made.id);
    } finally {
      await liveV.close();
    }
  });

  it("a second tab of the owner sees a duplicate-free create (a 200 sends nothing new)", async () => {
    const { a, board, n1, n2, arrow } = await setup();
    const live = await connect(a, board.id);
    try {
      const made = (await arrow(n1.id, n2.id)).body.arrow;
      await live.next((m) => m.type === "arrow:upsert" && m.arrow.id === made.id);
      await arrow(n1.id, n2.id);
      await new Promise((r) => setTimeout(r, 150));
      expect(live.messages.filter((m) => m.type === "arrow:upsert")).toEqual([]);
    } finally {
      await live.close();
    }
  });
});
