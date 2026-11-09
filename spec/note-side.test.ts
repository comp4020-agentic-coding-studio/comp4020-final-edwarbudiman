import { describe, expect, it } from "vitest";
import { boardOf, connect, signup } from "./helpers.ts";
import type { Client } from "./helpers.ts";

// The note's back side: per-person status, the creator's proof tick, comments.

const channelName = () => `side ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

async function noteOn(owner: Client, author: Client, extra: Record<string, unknown> = {}) {
  const { board } = await boardOf(owner, owner.username);
  const note = (await author.call("POST", `/api/boards/${board.id}/notes`, { text: "back side", x: 0, y: 0, ...extra })).body.note;
  return { board, note };
}
const find = async (who: Client, owner: Client, id: number) => (await boardOf(who, owner.username)).notes.find((n) => n.id === id);

describe("per-person status", () => {
  it("shows the creator who is on a note, and everyone else only counts and their own", async () => {
    const [a, b, c] = [await signup("a"), await signup("b"), await signup("c")];
    const { note } = await noteOn(b, a);
    expect((await b.call("PUT", `/api/notes/${note.id}/status`, { status: "done" })).status).toBe(200);
    expect((await c.call("PUT", `/api/notes/${note.id}/status`, { status: "progress" })).status).toBe(200);

    const mine = (await a.call("GET", `/api/notes/${note.id}/side`)).body;
    expect(mine.counts).toEqual({ done: 1, progress: 1 });
    expect(mine.people.map((p: any) => [p.name, p.status])).toEqual([[c.username, "progress"], [b.username, "done"]]);

    const bs = (await b.call("GET", `/api/notes/${note.id}/side`)).body;
    expect(bs).toMatchObject({ myStatus: "done", counts: { done: 1, progress: 1 } });
    expect(bs.people).toBeUndefined();
    expect(JSON.stringify(bs)).not.toContain(c.username);

    // each viewer's board carries their own status
    expect(await find(b, b, note.id)).toMatchObject({ myStatus: "done", doneCount: 1, progressCount: 1 });
    expect(await find(c, b, note.id)).toMatchObject({ myStatus: "progress" });
    expect((await find(a, b, note.id)).myStatus).toBeNull();
    expect((await find(a, b, note.id)).status).toBeUndefined();
  });

  it("clears with null, changes in place, and refuses anything else", async () => {
    const a = await signup("a");
    const { note } = await noteOn(a, a);
    const put = (status: unknown) => a.call("PUT", `/api/notes/${note.id}/status`, { status });
    expect((await put("progress")).body.note.myStatus).toBe("progress");
    expect((await put("done")).body.note).toMatchObject({ myStatus: "done", doneCount: 1, progressCount: 0 });
    expect((await put(null)).body.note).toMatchObject({ myStatus: null, doneCount: 0 });
    for (const bad of ["todo", "doing", "approved", 3, undefined]) expect((await put(bad)).status).toBe(400);
  });

  it("flags needsProof for the creator only, until proof is ticked", async () => {
    const [a, b] = [await signup("a"), await signup("b")];
    const { note } = await noteOn(b, a);
    expect((await find(a, b, note.id)).needsProof).toBe(false);
    await b.call("PUT", `/api/notes/${note.id}/status`, { status: "done" });
    expect((await find(a, b, note.id)).needsProof).toBe(true);
    expect((await find(b, b, note.id)).needsProof).toBe(false);
    await a.call("PUT", `/api/notes/${note.id}/proof`, { proof: true });
    expect((await find(a, b, note.id)).needsProof).toBe(false);
  });

  it("refuses the old shared status field on create and patch", async () => {
    const a = await signup("a");
    const { board, note } = await noteOn(a, a);
    expect((await a.call("PATCH", `/api/notes/${note.id}`, { status: "done" })).status).toBe(400);
    expect((await a.call("POST", `/api/boards/${board.id}/notes`, { text: "t", status: "todo" })).status).toBe(400);
  });

  it("counts each person once and drops a deleted note's rows", async () => {
    const [a, b] = [await signup("a"), await signup("b")];
    const { note } = await noteOn(a, a);
    await b.call("PUT", `/api/notes/${note.id}/status`, { status: "done" });
    await b.call("PUT", `/api/notes/${note.id}/status`, { status: "done" });
    expect((await a.call("GET", `/api/notes/${note.id}/side`)).body.counts.done).toBe(1);
    expect((await a.call("DELETE", `/api/notes/${note.id}`)).status).toBe(200);
    expect((await a.call("GET", `/api/notes/${note.id}/side`)).status).toBe(404);
  });
});

describe("proof", () => {
  it("is the creator's alone, on a user board", async () => {
    const [a, b] = [await signup("a"), await signup("b")];
    const { note } = await noteOn(b, a);
    expect((await b.call("PUT", `/api/notes/${note.id}/proof`, { proof: true })).status).toBe(403);
    expect((await a.call("PUT", `/api/notes/${note.id}/proof`, { proof: "yes" })).status).toBe(400);
    expect((await a.call("PUT", `/api/notes/${note.id}/proof`, { proof: true })).body.note.proof).toBe(true);
    expect((await find(b, b, note.id)).proof).toBe(true); // everyone sees it, and it's saved
    expect((await a.call("PUT", `/api/notes/${note.id}/proof`, { proof: false })).body.note.proof).toBe(false);
    expect((await find(b, b, note.id)).proof).toBe(false);
  });

  it("is the creator's alone on a channel too, though any member can edit the note", async () => {
    const [a, m] = [await signup("a"), await signup("m")];
    const slug = (await a.call("POST", "/api/channels", { name: channelName() })).body.board.slug;
    await m.call("GET", `/api/boards/channel/${slug}`);
    const channel = (await a.call("GET", `/api/boards/channel/${slug}`)).body.board;
    const note = (await a.call("POST", `/api/boards/${channel.id}/notes`, { text: "ours" })).body.note;
    expect((await m.call("PUT", `/api/notes/${note.id}/proof`, { proof: true })).status).toBe(403);
    expect((await a.call("PUT", `/api/notes/${note.id}/proof`, { proof: true })).status).toBe(200);
  });

  it("reaches other viewers live, each with their own summary and never a position", async () => {
    const [a, b] = [await signup("a"), await signup("b")];
    const { board, note } = await noteOn(b, a);
    const liveB = await connect(b, board.id);
    try {
      await a.call("PUT", `/api/notes/${note.id}/proof`, { proof: true });
      const seen = await liveB.next((m) => m.type === "note:side" && m.id === note.id && m.summary.proof === true, 1000);
      expect(seen.summary.myStatus).toBeNull();
      await b.call("PUT", `/api/notes/${note.id}/status`, { status: "done" });
      const own = await liveB.next((m) => m.type === "note:side" && m.id === note.id && m.summary.myStatus === "done", 1000);
      expect(own.summary).toMatchObject({ needsProof: false, doneCount: 1 });
      // the creator's own copy flags it, the others' don't
      await a.call("PUT", `/api/notes/${note.id}/proof`, { proof: false });
      const liveA = await connect(a, board.id);
      try {
        await b.call("PUT", `/api/notes/${note.id}/status`, { status: null });
        await b.call("PUT", `/api/notes/${note.id}/status`, { status: "done" });
        expect((await liveA.next((m) => m.type === "note:side" && m.summary.doneCount === 1, 1000)).summary.needsProof).toBe(true);
      } finally {
        await liveA.close();
      }
    } finally {
      await liveB.close();
    }
  });
});

describe("comments", () => {
  it("lets anyone who can see the note comment, oldest first, trimmed and bounded", async () => {
    const [a, b] = [await signup("a"), await signup("b")];
    const { note } = await noteOn(a, a);
    const first = await a.call("POST", `/api/notes/${note.id}/comments`, { text: "  hello  " });
    expect(first.status).toBe(201);
    expect(first.body.comment).toMatchObject({ author: a.username, text: "hello", mine: true, canDelete: true });
    await b.call("POST", `/api/notes/${note.id}/comments`, { text: "hi back" });
    const side = (await b.call("GET", `/api/notes/${note.id}/side`)).body;
    expect(side.comments.map((c: any) => [c.author, c.text, c.mine, c.canDelete])).toEqual([
      [a.username, "hello", false, false],
      [b.username, "hi back", true, true],
    ]);
    expect((await find(b, a, note.id)).commentCount).toBe(2);
    for (const text of ["", "   ", "x".repeat(501), 5]) expect((await b.call("POST", `/api/notes/${note.id}/comments`, { text })).status).toBe(400);
    expect((await b.call("POST", `/api/notes/${note.id}/comments`, { text: "x".repeat(500) })).status).toBe(201);
  });

  it("lets only the author edit, and the author or the board owner delete", async () => {
    const [owner, v, w] = [await signup("o"), await signup("v"), await signup("w")];
    const { note } = await noteOn(owner, v);
    const id = (await v.call("POST", `/api/notes/${note.id}/comments`, { text: "mine" })).body.comment.id;

    expect((await w.call("PATCH", `/api/comments/${id}`, { text: "hijack" })).status).toBe(403);
    expect((await owner.call("PATCH", `/api/comments/${id}`, { text: "hijack" })).status).toBe(403); // the owner may delete, not rewrite
    expect((await v.call("PATCH", `/api/comments/${id}`, { text: "" })).status).toBe(400);
    const edited = await v.call("PATCH", `/api/comments/${id}`, { text: "edited" });
    expect(edited.body.comment.text).toBe("edited");
    expect(edited.body.comment.updatedAt).toBeGreaterThanOrEqual(edited.body.comment.createdAt);

    expect((await w.call("DELETE", `/api/comments/${id}`)).status).toBe(403);
    expect((await owner.call("DELETE", `/api/comments/${id}`)).status).toBe(204); // the board's owner
    expect((await v.call("DELETE", `/api/comments/${id}`)).status).toBe(404);

    const own = (await w.call("POST", `/api/notes/${note.id}/comments`, { text: "w's" })).body.comment.id;
    expect((await w.call("DELETE", `/api/comments/${own}`)).status).toBe(204);
    expect((await a404(owner, "DELETE", `/api/comments/999999999`))).toBe(404);
  });

  it("lets a channel's owner delete, but not another member", async () => {
    const [a, m, n] = [await signup("a"), await signup("m"), await signup("n")];
    const slug = (await a.call("POST", "/api/channels", { name: channelName() })).body.board.slug;
    await m.call("GET", `/api/boards/channel/${slug}`);
    await n.call("GET", `/api/boards/channel/${slug}`);
    const channel = (await a.call("GET", `/api/boards/channel/${slug}`)).body.board;
    const note = (await m.call("POST", `/api/boards/${channel.id}/notes`, { text: "ours" })).body.note;
    const id = (await m.call("POST", `/api/notes/${note.id}/comments`, { text: "hey" })).body.comment.id;
    expect((await n.call("DELETE", `/api/comments/${id}`)).status).toBe(403);
    expect((await a.call("DELETE", `/api/comments/${id}`)).status).toBe(204);
  });

  it("goes with its note, and sits behind the note's board access", async () => {
    const [a, out] = [await signup("a"), await signup("x")];
    const slug = (await a.call("POST", "/api/channels", { name: channelName(), visibility: "list" })).body.board.slug;
    const channel = (await a.call("GET", `/api/boards/channel/${slug}`)).body.board;
    const note = (await a.call("POST", `/api/boards/${channel.id}/notes`, { text: "members only" })).body.note;
    for (const [m, p, body] of [["GET", "side"], ["POST", "comments", { text: "hi" }], ["PUT", "status", { status: "done" }], ["PUT", "proof", { proof: true }]] as const) {
      expect((await out.call(m, `/api/notes/${note.id}/${p}`, body)).status, `${m} ${p}`).toBe(404);
    }
  });
});

async function a404(c: Client, method: string, path: string) {
  return (await c.call(method, path)).status;
}

describe("a private note's back side", () => {
  it("is invisible to visitors, over REST and over the socket", async () => {
    const [owner, author, other] = [await signup("o"), await signup("a"), await signup("v")];
    const { board, note } = await noteOn(owner, author, { visibility: "private" });
    const commentId = (await author.call("POST", `/api/notes/${note.id}/comments`, { text: "secret" })).body.comment.id;

    for (const [m, p, body] of [["GET", "side"], ["POST", "comments", { text: "hi" }], ["PUT", "status", { status: "done" }], ["PUT", "proof", { proof: true }]] as const) {
      expect((await other.call(m, `/api/notes/${note.id}/${p}`, body)).status, `${m} ${p}`).toBe(404);
    }
    expect((await other.call("PATCH", `/api/comments/${commentId}`, { text: "x" })).status).toBe(404);
    expect((await other.call("DELETE", `/api/comments/${commentId}`)).status).toBe(404);

    const liveOther = await connect(other, board.id);
    const liveOwner = await connect(owner, board.id);
    try {
      await author.call("POST", `/api/notes/${note.id}/comments`, { text: "again" });
      await author.call("PUT", `/api/notes/${note.id}/proof`, { proof: true });
      await liveOwner.next((m) => m.type === "note:side" && m.id === note.id, 1000); // the owner can see it
      await new Promise((r) => setTimeout(r, 150));
      expect(liveOther.messages.filter((m) => m.type === "note:upsert" || m.type === "note:side")).toEqual([]);
    } finally {
      await liveOther.close();
      await liveOwner.close();
    }
    // the owner can see it and can delete the comment
    expect((await owner.call("GET", `/api/notes/${note.id}/side`)).body.comments.length).toBe(2);
    expect((await owner.call("DELETE", `/api/comments/${commentId}`)).status).toBe(204);
  });
});

describe("comments live", () => {
  it("reach other viewers of the board on create, edit and delete", async () => {
    const [a, b] = [await signup("a"), await signup("b")];
    const { board, note } = await noteOn(b, a);
    const liveB = await connect(b, board.id);
    try {
      const id = (await a.call("POST", `/api/notes/${note.id}/comments`, { text: "one" })).body.comment.id;
      const created = await liveB.next((m) => m.type === "note:side" && m.id === note.id && m.summary.commentCount === 1, 1000);
      expect(created.summary.commentCount).toBe(1);
      await a.call("PATCH", `/api/comments/${id}`, { text: "two" });
      await liveB.next((m) => m.type === "note:side" && m.id === note.id, 1000);
      await a.call("DELETE", `/api/comments/${id}`);
      await liveB.next((m) => m.type === "note:side" && m.id === note.id && m.summary.commentCount === 0, 1000);
    } finally {
      await liveB.close();
    }
  });
});

describe("at scale", () => {
  it("serves a board of 200 notes with counts in one pass", async () => {
    const a = await signup("a");
    const { board } = await boardOf(a, a.username);
    const ids: number[] = [];
    for (let i = 0; i < 200; i++) ids.push((await a.call("POST", `/api/boards/${board.id}/notes`, { text: `n${i}`, x: i, y: 0 })).body.note.id);
    await Promise.all(ids.slice(0, 20).map((id) => a.call("POST", `/api/notes/${id}/comments`, { text: "c" })));
    await Promise.all(ids.slice(0, 20).map((id) => a.call("PUT", `/api/notes/${id}/status`, { status: "done" })));
    const t = Date.now();
    const notes = (await boardOf(a, a.username)).notes;
    expect(notes).toHaveLength(200);
    expect(notes.filter((n) => n.commentCount === 1 && n.doneCount === 1)).toHaveLength(20);
    expect(Date.now() - t).toBeLessThan(1500);
  }, 60_000);
});
