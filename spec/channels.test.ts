import { describe, expect, it } from "vitest";
import { secret, signup } from "./helpers.ts";

// T23 (and F-02): who gets into a channel, and what members can do there.

const name = (p: string) => `${p} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

describe("channels", () => {
  it("refuses to join a key channel without the key, and never returns the key", async () => {
    const owner = await signup("o");
    const other = await signup("p");
    const key = secret(`key-${Math.random().toString(36).slice(2)}`); // every response is screened for it
    const created = await owner.call("POST", "/api/channels", { name: name("secret"), visibility: "key", key });
    expect(created.status).toBe(201);
    const slug = created.body.board.slug;
    expect(JSON.stringify(created.body)).not.toMatch(/key_hash|keyHash/);

    expect((await other.call("GET", `/api/boards/channel/${slug}`)).status).toBe(403);
    expect((await other.call("POST", `/api/channels/${slug}/join`, {})).status).toBe(403);
    expect((await other.call("POST", `/api/channels/${slug}/join`, { key: "wrong" })).status).toBe(403);
    // not a member, so no notes either
    const board = (await owner.call("GET", `/api/boards/channel/${slug}`)).body.board;
    expect((await other.call("POST", `/api/boards/${board.id}/notes`, { text: "sneak" })).status).toBe(404);

    expect((await other.call("POST", `/api/channels/${slug}/join`, { key })).status).toBe(200);
    // membership is remembered: no key needed the second time
    expect((await other.call("GET", `/api/boards/channel/${slug}`)).status).toBe(200);
    const list = await other.call("GET", "/api/channels");
    expect(list.body.channels.find((c: any) => c.slug === slug)).toMatchObject({ member: true, visibility: "key" });
  });

  it("lets every member create, edit, move and delete any note on a channel", async () => {
    const a = await signup("a");
    const b = await signup("b");
    const slug = (await a.call("POST", "/api/channels", { name: name("open"), visibility: "public" })).body.board.slug;
    const { board } = (await b.call("GET", `/api/boards/channel/${slug}`)).body; // walking in joins
    const note = (await a.call("POST", `/api/boards/${board.id}/notes`, { text: "by a", x: 0, y: 0 })).body.note;
    expect((await b.call("PATCH", `/api/notes/${note.id}`, { text: "edited by b", color: "pink" })).status).toBe(200);
    expect((await b.call("PATCH", `/api/notes/${note.id}`, { x: 50, y: 60 })).status).toBe(200);
    // no private notes on channels
    expect((await b.call("PATCH", `/api/notes/${note.id}`, { visibility: "private" })).status).toBe(400);
    expect((await b.call("DELETE", `/api/notes/${note.id}`)).status).toBe(200);
  });

  it("keeps an invite-only channel to its list, and a denied user out of any channel", async () => {
    const owner = await signup("o");
    const invited = await signup("i");
    const stranger = await signup("s");
    const slug = (await owner.call("POST", "/api/channels", { name: name("club"), visibility: "list", allow: [invited.username] })).body.board.slug;
    expect((await stranger.call("POST", `/api/channels/${slug}/join`, {})).status).toBe(403);
    expect((await invited.call("POST", `/api/channels/${slug}/join`, {})).status).toBe(200);

    const pub = (await owner.call("POST", "/api/channels", { name: name("pub"), visibility: "public", deny: [stranger.username] })).body.board.slug;
    expect((await stranger.call("GET", `/api/boards/channel/${pub}`)).status).toBe(403);
    expect((await invited.call("GET", `/api/boards/channel/${pub}`)).status).toBe(200);

    // denying a member later removes them
    expect((await owner.call("PUT", `/api/channels/${pub}/access`, { deny: [invited.username] })).status).toBe(200);
    expect((await invited.call("GET", `/api/boards/channel/${pub}`)).status).toBe(403);
    // only the creator manages the lists
    expect((await invited.call("PUT", `/api/channels/${slug}/access`, { allow: [] })).status).toBe(403);
  });
});
