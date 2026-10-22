import { describe, expect, it } from "vitest";
import { boardOf, connect, signup } from "./helpers.ts";

// T32: note status (to do, doing, done). Stopping at the ends is the client's
// job; this checks what the API guarantees.

const channelName = () => `status ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

describe("note status", () => {
  it("starts a note at todo and keeps each step forward", async () => {
    const a = await signup("a");
    const { board } = await boardOf(a, a.username);
    const note = (await a.call("POST", `/api/boards/${board.id}/notes`, { text: "ship it", x: 0, y: 0 })).body.note;
    expect(note.status).toBe("todo");

    for (const status of ["doing", "done"]) {
      const res = await a.call("PATCH", `/api/notes/${note.id}`, { status });
      expect(res.status).toBe(200);
      expect(res.body.note.status).toBe(status);
      expect((await boardOf(a, a.username)).notes.find((n) => n.id === note.id).status).toBe(status);
    }
  });

  it("refuses a status the app doesn't offer", async () => {
    const a = await signup("a");
    const { board } = await boardOf(a, a.username);
    const note = (await a.call("POST", `/api/boards/${board.id}/notes`, { text: "t", x: 0, y: 0 })).body.note;
    for (const status of ["approved", "nope"]) {
      expect((await a.call("PATCH", `/api/notes/${note.id}`, { status })).status).toBe(400);
      expect((await a.call("POST", `/api/boards/${board.id}/notes`, { text: "t", status })).status).toBe(400);
    }
    expect((await boardOf(a, a.username)).notes.find((n) => n.id === note.id).status).toBe("todo");
  });

  it("lets only the author change status on a user board, and any member on a channel", async () => {
    const [a, v] = [await signup("a"), await signup("v")];
    const { board } = await boardOf(a, a.username);
    const note = (await a.call("POST", `/api/boards/${board.id}/notes`, { text: "mine", x: 0, y: 0 })).body.note;
    expect((await v.call("PATCH", `/api/notes/${note.id}`, { status: "doing" })).status).toBe(403);
    expect((await boardOf(a, a.username)).notes.find((n) => n.id === note.id).status).toBe("todo");

    const slug = (await a.call("POST", "/api/channels", { name: channelName(), visibility: "public" })).body.board.slug;
    const channel = (await v.call("GET", `/api/boards/channel/${slug}`)).body.board; // walking in joins
    const shared = (await a.call("POST", `/api/boards/${channel.id}/notes`, { text: "ours", x: 0, y: 0 })).body.note;
    const res = await v.call("PATCH", `/api/notes/${shared.id}`, { status: "doing" });
    expect(res.status).toBe(200);
    expect(res.body.note.status).toBe("doing");
  });

  it("sends a status change to another viewer of the board", async () => {
    const [a, b] = [await signup("a"), await signup("b")];
    const { board } = await boardOf(a, a.username);
    const note = (await a.call("POST", `/api/boards/${board.id}/notes`, { text: "watch me", x: 0, y: 0 })).body.note;
    const liveB = await connect(b, board.id);
    try {
      await a.call("PATCH", `/api/notes/${note.id}`, { status: "doing" });
      const seen = await liveB.next((m) => m.type === "note:upsert" && m.note.id === note.id && m.note.status === "doing", 1000);
      expect(seen.note.status).toBe("doing");
    } finally {
      await liveB.close();
    }
  });
});
