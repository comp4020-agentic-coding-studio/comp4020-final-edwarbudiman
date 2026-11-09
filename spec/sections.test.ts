import { describe, expect, it } from "vitest";
import { boardOf, connect, secret, signup } from "./helpers.ts";
import type { Client } from "./helpers.ts";

// label-sections: named zones behind the notes. The owner writes on a user
// board, any member on a channel; nobody else. Zones never overlap.

async function setup() {
  const [a, v] = [await signup("a"), await signup("v")];
  const { board } = await boardOf(a, a.username);
  const make = (body: Record<string, unknown>, c: Client = a, id: number = board.id) => c.call("POST", `/api/boards/${id}/sections`, { name: "Z", x: 0, y: 0, w: 300, h: 200, ...body });
  return { a, v, board, make };
}

const sectionsOf = async (c: Client, owner: string) => (await c.call("GET", `/api/boards/user/${owner}`)).body.sections as any[];

describe("sections: create", () => {
  it("creates a section, defaults the colour, trims the name, and returns it on load", async () => {
    const { a, board, make } = await setup();
    const r = await make({ name: "  Ideas  ", x: 10, y: 20, w: 300, h: 200 });
    expect(r.status).toBe(201);
    expect(r.body.section).toMatchObject({ boardId: board.id, name: "Ideas", x: 10, y: 20, w: 300, h: 200, color: "yellow" });
    const colored = await make({ x: 1000, color: "blue" });
    expect(colored.body.section.color).toBe("blue");
    const loaded = await sectionsOf(a, a.username);
    expect(loaded.map((s) => s.id).sort()).toEqual([r.body.section.id, colored.body.section.id].sort());
  });

  it("rejects a bad name, size, colour or number with 400", async () => {
    const { make } = await setup();
    expect((await make({ name: "" })).status).toBe(400);
    expect((await make({ name: "   " })).status).toBe(400);
    expect((await make({ name: "x".repeat(41) })).status).toBe(400);
    expect((await make({ name: 5 })).status).toBe(400);
    expect((await make({ w: 79 })).status).toBe(400);
    expect((await make({ h: 59 })).status).toBe(400);
    expect((await make({ x: "left" })).status).toBe(400);
    expect((await make({ color: "chartreuse" })).status).toBe(400);
    expect((await make({ name: "x".repeat(40) })).status).toBe(201);
  });

  it("404s for an unknown board", async () => {
    const { a, make } = await setup();
    expect((await make({}, a, 999999)).status).toBe(404);
  });

  it("answers 409 for a section overlapping another, but allows touching edges", async () => {
    const { a, make } = await setup();
    expect((await make({ x: 0, y: 0, w: 300, h: 200 })).status).toBe(201);
    const clash = await make({ x: 299, y: 0 });
    expect(clash.status).toBe(409);
    expect(clash.body.error).toBe("sections can't overlap");
    expect((await make({ x: 100, y: 50, w: 80, h: 60 })).status).toBe(409); // fully inside
    expect((await make({ x: 300, y: 0 })).status).toBe(201); // touches the right edge
    expect((await make({ x: 0, y: 200 })).status).toBe(201); // touches the bottom edge
    expect((await sectionsOf(a, a.username)).length).toBe(3);
  });
});

describe("sections: update and delete", () => {
  it("renames, moves, resizes and recolours, and it survives a reload", async () => {
    const { a, make } = await setup();
    const { section } = (await make({})).body;
    const r = await a.call("PATCH", `/api/sections/${section.id}`, { name: "Done", x: 50, y: 60, w: 400, h: 250, color: "green" });
    expect(r.status).toBe(200);
    expect(r.body.section).toMatchObject({ id: section.id, name: "Done", x: 50, y: 60, w: 400, h: 250, color: "green" });
    expect((await sectionsOf(a, a.username))[0]).toMatchObject({ name: "Done", x: 50, w: 400, color: "green" });
    const partial = await a.call("PATCH", `/api/sections/${section.id}`, { name: "Only name" });
    expect(partial.body.section).toMatchObject({ name: "Only name", x: 50, w: 400 });
  });

  it("refuses a bad PATCH (400), nothing to change (400), an unknown id (404)", async () => {
    const { a, make } = await setup();
    const { section } = (await make({})).body;
    const p = (body: unknown) => a.call("PATCH", `/api/sections/${section.id}`, body);
    expect((await p({ name: "" })).status).toBe(400);
    expect((await p({ w: 10 })).status).toBe(400);
    expect((await p({ color: "nope" })).status).toBe(400);
    expect((await p({})).status).toBe(400);
    expect((await a.call("PATCH", "/api/sections/999999", { name: "x" })).status).toBe(404);
    expect((await a.call("DELETE", "/api/sections/999999")).status).toBe(404);
  });

  it("answers 409 for a PATCH onto another section, leaves it where it was, and a resize into one, but lets a touching resize through", async () => {
    const { a, make } = await setup();
    const first = (await make({ x: 0, y: 0 })).body.section;
    const second = (await make({ x: 400, y: 0 })).body.section;
    const moved = await a.call("PATCH", `/api/sections/${second.id}`, { x: 250 });
    expect(moved.status).toBe(409);
    expect(moved.body.error).toBe("sections can't overlap");
    const grown = await a.call("PATCH", `/api/sections/${first.id}`, { w: 500 }); // grows into the second
    expect(grown.status).toBe(409);
    expect((await sectionsOf(a, a.username)).find((s) => s.id === second.id)).toMatchObject({ x: 400, w: 300 });
    expect((await sectionsOf(a, a.username)).find((s) => s.id === first.id)).toMatchObject({ x: 0, w: 300 });
    expect((await a.call("PATCH", `/api/sections/${first.id}`, { w: 400 })).status).toBe(200); // exactly touching
    expect((await a.call("PATCH", `/api/sections/${first.id}`, { x: 10, y: 10 })).status).toBe(409);
    expect((await a.call("PATCH", `/api/sections/${first.id}`, { name: "same place" })).status).toBe(200); // not a clash with itself
  });

  it("deletes only the section: the notes' count and positions stay", async () => {
    const { a, board, make } = await setup();
    const n1 = (await a.call("POST", `/api/boards/${board.id}/notes`, { text: "in", x: 50, y: 50 })).body.note;
    const n2 = (await a.call("POST", `/api/boards/${board.id}/notes`, { text: "out", x: 900, y: 50 })).body.note;
    const { section } = (await make({})).body;
    const del = await a.call("DELETE", `/api/sections/${section.id}`);
    expect(del.status).toBe(204);
    const after = await boardOf(a, a.username);
    expect(await sectionsOf(a, a.username)).toEqual([]);
    expect(after.notes.filter((n) => n.id === n1.id || n.id === n2.id).map((n) => [n.id, n.x, n.y]).sort()).toEqual([[n1.id, n1.x, n1.y], [n2.id, n2.x, n2.y]].sort());
    expect(after.notes.length).toBe(2);
  });

  it("keeps notes (and their labels) untouched when a section moves", async () => {
    const { a, board, make } = await setup();
    const n = (await a.call("POST", `/api/boards/${board.id}/notes`, { text: "stay", x: 50, y: 50, labels: ["old"] })).body.note;
    const { section } = (await make({})).body;
    await a.call("PATCH", `/api/sections/${section.id}`, { x: 700, y: 700 });
    const note = (await boardOf(a, a.username)).notes.find((x) => x.id === n.id);
    expect(note).toMatchObject({ x: 50, y: 50, labels: ["old"] });
  });
});

describe("sections: who may write", () => {
  it("lets a visitor see sections but answers 403 to their POST, PATCH and DELETE", async () => {
    const { a, v, board, make } = await setup();
    const { section } = (await make({})).body;
    expect((await sectionsOf(v, a.username)).map((s) => s.id)).toEqual([section.id]);
    expect((await make({ x: 2000 }, v)).status).toBe(403);
    expect((await v.call("PATCH", `/api/sections/${section.id}`, { name: "mine" })).status).toBe(403);
    expect((await v.call("DELETE", `/api/sections/${section.id}`)).status).toBe(403);
    expect((await sectionsOf(a, a.username))[0].name).toBe("Z");
    expect(board.id).toBeGreaterThan(0);
  });

  it("answers 401 without a session", async () => {
    const { board } = await setup();
    const { rawCall } = await import("./helpers.ts");
    expect((await rawCall("POST", `/api/boards/${board.id}/sections`, { name: "x", x: 0, y: 0, w: 100, h: 100 })).status).toBe(401);
  });

  it("lets any channel member write, and refuses a non-member", async () => {
    const [owner, member, stranger] = [await signup("o"), await signup("m"), await signup("s")];
    const ch = await owner.call("POST", "/api/channels", { name: "sections" + Math.random().toString(36).slice(2, 8) });
    expect(ch.status).toBe(201);
    const slug = ch.body.board.slug as string;
    const id = ch.body.board.id as number;
    expect((await member.call("GET", `/api/boards/channel/${slug}`)).status).toBe(200); // public: walking in joins

    const made = await member.call("POST", `/api/boards/${id}/sections`, { name: "Team", x: 0, y: 0, w: 300, h: 200 });
    expect(made.status).toBe(201);
    const sid = made.body.section.id;
    expect((await owner.call("PATCH", `/api/sections/${sid}`, { name: "Renamed" })).status).toBe(200);
    expect((await member.call("PATCH", `/api/sections/${sid}`, { x: 20 })).status).toBe(200);
    const loaded = (await member.call("GET", `/api/boards/channel/${slug}`)).body;
    expect(loaded.sections).toHaveLength(1);
    expect(loaded.sections[0]).toMatchObject({ name: "Renamed", x: 20 });

    // a stranger to a key channel can't write
    const locked = await owner.call("POST", "/api/channels", { name: "locked" + Math.random().toString(36).slice(2, 8), visibility: "key", key: secret("key-" + Math.random().toString(36).slice(2)) });
    const lockedId = locked.body.board.id as number;
    const lsec = await owner.call("POST", `/api/boards/${lockedId}/sections`, { name: "Mine", x: 0, y: 0, w: 300, h: 200 });
    expect(lsec.status).toBe(201);
    expect((await stranger.call("POST", `/api/boards/${lockedId}/sections`, { name: "x", x: 900, y: 0, w: 300, h: 200 })).status).toBe(403);
    expect((await stranger.call("PATCH", `/api/sections/${lsec.body.section.id}`, { name: "x" })).status).toBe(403);
    expect((await stranger.call("DELETE", `/api/sections/${lsec.body.section.id}`)).status).toBe(403);

    expect((await member.call("DELETE", `/api/sections/${sid}`)).status).toBe(204);
  });
});

describe("sections: live relay", () => {
  it("relays upsert and delete to everyone in the room, including a visitor", async () => {
    const { a, v, board, make } = await setup();
    const liveV = await connect(v, board.id);
    const liveA = await connect(a, board.id);
    try {
      const { section } = (await make({ name: "Live" })).body;
      const seenV = await liveV.next((m) => m.type === "section:upsert" && m.section.id === section.id);
      expect(seenV.section).toMatchObject({ name: "Live", boardId: board.id, color: "yellow" });
      await liveA.next((m) => m.type === "section:upsert" && m.section.id === section.id);

      await a.call("PATCH", `/api/sections/${section.id}`, { name: "Moved", x: 40 });
      const updated = await liveV.next((m) => m.type === "section:upsert" && m.section.name === "Moved");
      expect(updated.section.x).toBe(40);

      // a refused write (409 or 403) relays nothing
      await make({ x: 100 });
      await v.call("DELETE", `/api/sections/${section.id}`);
      await a.call("DELETE", `/api/sections/${section.id}`);
      await liveV.next((m) => m.type === "section:delete" && m.id === section.id);
      expect(liveV.messages.filter((m) => m.type === "section:upsert")).toEqual([]);
    } finally {
      await liveV.close();
      await liveA.close();
    }
  });

  it("is not sent to another board's room", async () => {
    const { a, make } = await setup();
    const other = await signup("o");
    const otherBoard = (await boardOf(other, other.username)).board;
    const live = await connect(other, otherBoard.id);
    try {
      const { section } = (await make({})).body;
      await a.call("DELETE", `/api/sections/${section.id}`);
      await new Promise((r) => setTimeout(r, 200));
      expect(live.messages.filter((m) => m.type.startsWith("section:"))).toEqual([]);
    } finally {
      await live.close();
    }
  });
});

describe("sections: board payload", () => {
  it("carries sections on user and channel boards, empty by default", async () => {
    const { a } = await setup();
    expect(await sectionsOf(a, a.username)).toEqual([]);
    const ch = await a.call("POST", "/api/channels", { name: "payload" + Math.random().toString(36).slice(2, 8) });
    const loaded = (await a.call("GET", `/api/boards/channel/${ch.body.board.slug}`)).body;
    expect(loaded.sections).toEqual([]);
  });

  it("still loads notes that carry old labels, labels untouched", async () => {
    const { a, board } = await setup();
    await a.call("POST", `/api/boards/${board.id}/notes`, { text: "tagged", x: 0, y: 0, labels: ["urgent"] });
    const notes = (await boardOf(a, a.username)).notes;
    expect(notes[0].labels).toEqual(["urgent"]);
  });
});
