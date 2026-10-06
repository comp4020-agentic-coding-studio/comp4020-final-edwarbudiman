import { describe, expect, it } from "vitest";
import WebSocket from "ws";
import { baseUrl, boardOf, connect, signup } from "./helpers.ts";

// T20: real-time — changes reach the room fast, and the drag lock holds.

describe("real-time boards", () => {
  it("delivers a change made in session A to session B in under a second", async () => {
    const a = await signup("a");
    const b = await signup("b");
    const { board } = await boardOf(a, a.username);
    const liveB = await connect(b, board.id);
    try {
      const started = Date.now();
      const created = await a.call("POST", `/api/boards/${board.id}/notes`, { text: "hello b", x: 5, y: 5 });
      const seen = await liveB.next((m) => m.type === "note:upsert" && m.note.id === created.body.note.id, 1000);
      expect(Date.now() - started).toBeLessThan(1000);
      expect(seen.note.text).toBe("hello b");

      const t2 = Date.now();
      await a.call("PATCH", `/api/notes/${created.body.note.id}`, { text: "edited" });
      const edit = await liveB.next((m) => m.type === "note:upsert" && m.note.text === "edited", 1000);
      expect(Date.now() - t2).toBeLessThan(1000);
      expect(edit.note.canEdit).toBe(false); // computed for B, not copied from A
    } finally {
      await liveB.close();
    }
  });

  it("never sends a private note to a socket that may not see it", async () => {
    const [a, b, c] = [await signup("a"), await signup("b"), await signup("c")];
    const { board } = await boardOf(a, a.username);
    const liveA = await connect(a, board.id);
    const liveC = await connect(c, board.id);
    try {
      const priv = await b.call("POST", `/api/boards/${board.id}/notes`, { text: "for a only", x: 0, y: 0, visibility: "private" });
      await liveA.next((m) => m.type === "note:upsert" && m.note.id === priv.body.note.id, 1000);
      const pub = await b.call("POST", `/api/boards/${board.id}/notes`, { text: "for all", x: 0, y: 0 });
      // C gets the public note, and by then would have had the private one
      await liveC.next((m) => m.type === "note:upsert" && m.note.id === pub.body.note.id, 1000);
      expect(JSON.stringify(liveC.messages)).not.toContain("for a only");
    } finally {
      await liveA.close();
      await liveC.close();
    }
  });

  it("lets the first holder keep a note: a second client can't move a locked note", async () => {
    const a = await signup("a");
    const { board } = await boardOf(a, a.username);
    const note = (await a.call("POST", `/api/boards/${board.id}/notes`, { text: "hold me", x: 0, y: 0 })).body.note;
    // two tabs of the owner (both allowed to move it), plus a watcher
    const tab1 = await connect(a, board.id);
    const tab2 = await connect(a, board.id);
    try {
      tab1.send({ type: "lock:acquire", id: note.id });
      await tab1.next((m) => m.type === "lock" && m.id === note.id && m.mine === true);
      const shown = await tab2.next((m) => m.type === "lock" && m.id === note.id);
      expect(shown.mine).toBe(false);
      expect(shown.holder).toBe(a.username);

      // the second client asks for the lock and is refused
      tab2.send({ type: "lock:acquire", id: note.id });
      const denied = await tab2.next((m) => m.type === "lock:denied" && m.id === note.id);
      expect(denied.holder).toBe(a.username);

      // its live moves are refused too, and never reach the holder
      tab2.send({ type: "note:move", id: note.id, x: 500, y: 500 });
      await tab2.next((m) => m.type === "lock:denied" && m.id === note.id);
      tab1.send({ type: "note:move", id: note.id, x: 20, y: 30 });
      const moved = await tab2.next((m) => m.type === "note:move" && m.id === note.id);
      expect(moved).toMatchObject({ x: 20, y: 30 });
      expect(tab1.messages.some((m) => m.type === "note:move" && m.x === 500)).toBe(false);

      // releasing frees it for the next one
      tab1.send({ type: "lock:release", id: note.id });
      await tab2.next((m) => m.type === "lock" && m.id === note.id && m.holder === null);
      tab2.send({ type: "lock:acquire", id: note.id });
      await tab2.next((m) => m.type === "lock" && m.id === note.id && m.mine === true);
    } finally {
      await tab1.close();
      await tab2.close();
    }
  });

  it("refuses a REST move of a note someone else is holding", async () => {
    const a = await signup("a");
    const b = await signup("b");
    // on a channel both can move any note
    const ch = await a.call("POST", "/api/channels", { name: `lock ${Date.now()}`, visibility: "public" });
    const slug = ch.body.board.slug;
    const { board } = (await b.call("GET", `/api/boards/channel/${slug}`)).body;
    const note = (await a.call("POST", `/api/boards/${board.id}/notes`, { text: "shared", x: 0, y: 0 })).body.note;
    const liveA = await connect(a, board.id);
    try {
      liveA.send({ type: "lock:acquire", id: note.id });
      await liveA.next((m) => m.type === "lock" && m.mine === true);
      expect((await b.call("PATCH", `/api/notes/${note.id}`, { x: 100, y: 100 })).status).toBe(409);
      expect((await b.call("DELETE", `/api/notes/${note.id}`)).status).toBe(409);
      // when the holder disconnects, the lock goes with them
      await liveA.close();
      await new Promise((r) => setTimeout(r, 200));
      expect((await b.call("PATCH", `/api/notes/${note.id}`, { x: 100, y: 100 })).status).toBe(200);
    } finally {
      await liveA.close();
    }
  });

  it("shows anonymous users' cursors without a name", async () => {
    const a = await signup("a");
    const shy = await signup("s");
    await shy.call("PATCH", "/api/me", { anonymous: true });
    const { board } = await boardOf(a, a.username);
    const liveA = await connect(a, board.id);
    const liveS = await connect(shy, board.id);
    try {
      liveS.send({ type: "cursor", x: 10, y: 20 });
      const cur = await liveA.next((m) => m.type === "cursor");
      expect(cur.name).toBeNull();
      const p = await liveA.next((m) => m.type === "presence" && m.anon === 1);
      expect(p.users).not.toContain(shy.username);
    } finally {
      await liveA.close();
      await liveS.close();
    }
  });

  it("refuses a WebSocket from another origin or without a session", async () => {
    const url = new URL("/ws", baseUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const a = await signup("a");
    const status = (headers: Record<string, string>) =>
      new Promise<number>((resolve) => {
        const ws = new WebSocket(url, { headers });
        ws.on("unexpected-response", (_req, res) => resolve(res.statusCode ?? 0));
        ws.on("open", () => {
          ws.close();
          resolve(101);
        });
        ws.on("error", () => {});
      });
    expect(await status({ cookie: a.cookie, origin: "https://evil.example" })).toBe(403);
    expect(await status({ origin: new URL(baseUrl).origin })).toBe(401);
    expect(await status({ cookie: a.cookie, origin: new URL(baseUrl).origin })).toBe(101);
  });
});
