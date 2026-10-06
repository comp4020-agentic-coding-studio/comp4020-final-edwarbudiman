import { describe, expect, it } from "vitest";
import { boardOf, login, rawCall, signup } from "./helpers.ts";

// T11: the user-board rules from the README, checked against the running app.

describe("notes on user boards", () => {
  it("keeps a private note on A's board out of B's view of it", async () => {
    const a = await signup("a");
    const b = await signup("b");
    const { board } = await boardOf(a, a.username);
    const pub = await a.call("POST", `/api/boards/${board.id}/notes`, { text: "for everyone", x: 0, y: 0 });
    const priv = await a.call("POST", `/api/boards/${board.id}/notes`, { text: "just for me", x: 300, y: 0, visibility: "private" });
    expect(pub.status).toBe(201);
    expect(priv.status).toBe(201);

    const seenByB = (await boardOf(b, a.username)).notes.map((n) => n.id);
    expect(seenByB).toContain(pub.body.note.id);
    expect(seenByB).not.toContain(priv.body.note.id);
    // and it can't be reached directly either
    expect((await b.call("PATCH", `/api/notes/${priv.body.note.id}`, { text: "hi" })).status).toBe(404);
    expect((await b.call("DELETE", `/api/notes/${priv.body.note.id}`)).status).toBe(404);
  });

  it("shows a private note B leaves on A's board to A, but not to C", async () => {
    const [a, b, c] = [await signup("a"), await signup("b"), await signup("c")];
    const { board } = await boardOf(b, a.username);
    const left = await b.call("POST", `/api/boards/${board.id}/notes`, { text: "psst", x: 10, y: 10, visibility: "private" });
    expect(left.status).toBe(201);
    const id = left.body.note.id;

    expect((await boardOf(a, a.username)).notes.map((n) => n.id)).toContain(id);
    expect((await boardOf(b, a.username)).notes.map((n) => n.id)).toContain(id);
    expect((await boardOf(c, a.username)).notes.map((n) => n.id)).not.toContain(id);
  });

  it("doesn't let a visitor move, edit or delete someone else's note on A's board", async () => {
    const [a, b, v] = [await signup("a"), await signup("b"), await signup("v")];
    const { board } = await boardOf(a, a.username);
    const owners = (await a.call("POST", `/api/boards/${board.id}/notes`, { text: "mine", x: 0, y: 0 })).body.note;
    const bs = (await b.call("POST", `/api/boards/${board.id}/notes`, { text: "from b", x: 250, y: 0 })).body.note;

    for (const note of [owners, bs]) {
      expect((await v.call("PATCH", `/api/notes/${note.id}`, { x: 999, y: 999 })).status).toBe(403);
      expect((await v.call("PATCH", `/api/notes/${note.id}`, { text: "vandal" })).status).toBe(403);
      expect((await v.call("DELETE", `/api/notes/${note.id}`)).status).toBe(403);
    }
    const after = (await boardOf(a, a.username)).notes;
    expect(after.find((n) => n.id === owners.id)).toMatchObject({ x: 0, y: 0, text: "mine" });
    expect(after.find((n) => n.id === bs.id)).toMatchObject({ x: 250, y: 0, text: "from b" });

    // the visitor's own note is theirs to move and delete...
    const vs = (await v.call("POST", `/api/boards/${board.id}/notes`, { text: "from v", x: 0, y: 300 })).body.note;
    expect((await v.call("PATCH", `/api/notes/${vs.id}`, { x: 40, y: 40 })).status).toBe(200);
    // ...and the owner can move or delete any note on their board, but not reword it
    expect((await a.call("PATCH", `/api/notes/${vs.id}`, { x: 80, y: 80 })).status).toBe(200);
    expect((await a.call("PATCH", `/api/notes/${vs.id}`, { text: "edited by owner" })).status).toBe(403);
    expect((await a.call("DELETE", `/api/notes/${vs.id}`)).status).toBe(200);
  });

  it("keeps labels on a note: trimmed, de-duplicated, limited, and only the author can change them", async () => {
    const [a, v] = [await signup("a"), await signup("v")];
    const { board } = await boardOf(a, a.username);
    const note = (await a.call("POST", `/api/boards/${board.id}/notes`, { text: "t", x: 0, y: 0, labels: [" work ", "Work", "today"] })).body.note;
    expect(note.labels).toEqual(["work", "today"]);
    expect((await a.call("PATCH", `/api/notes/${note.id}`, { labels: ["home"] })).body.note.labels).toEqual(["home"]);
    expect((await a.call("PATCH", `/api/notes/${note.id}`, { labels: ["a", "b", "c", "d", "e", "f"] })).status).toBe(400);
    expect((await a.call("PATCH", `/api/notes/${note.id}`, { labels: ["x".repeat(25)] })).status).toBe(400);
    expect((await v.call("PATCH", `/api/notes/${note.id}`, { labels: ["vandal"] })).status).toBe(403);
    expect((await boardOf(a, a.username)).notes.find((n) => n.id === note.id).labels).toEqual(["home"]);
  });

  it("keeps a note across log-out and log-in (a fresh session sees it)", async () => {
    const a = await signup("a");
    const { board } = await boardOf(a, a.username);
    const note = (await a.call("POST", `/api/boards/${board.id}/notes`, { text: "remember me", color: "green", x: 12, y: 34 })).body.note;
    expect((await a.call("POST", "/api/logout")).status).toBe(200);
    expect((await a.call("GET", "/api/me")).status).toBe(401);

    const again = await login(a.username, a.password);
    const found = (await boardOf(again, a.username)).notes.find((n) => n.id === note.id);
    expect(found).toMatchObject({ text: "remember me", color: "green", x: 12, y: 34 });
  });

  it("refuses everything but sign-up, log-in and the README without a session", async () => {
    expect((await rawCall("GET", "/api/users")).status).toBe(401);
    expect((await rawCall("GET", "/api/boards/user/demo1")).status).toBe(401);
    expect((await rawCall("POST", "/api/boards/1/notes", { text: "x" })).status).toBe(401);
    expect((await rawCall("GET", "/readme/")).status).toBe(200);
  });

  it("never returns a password or its hash", async () => {
    // helpers.ts screens every response in this suite; this one walks the
    // account endpoints explicitly, where a leak would most likely be
    const a = await signup("a");
    for (const path of ["/api/me", "/api/users", `/api/boards/user/${a.username}`, "/api/channels", "/api/stats"]) {
      const r = await a.call("GET", path);
      expect(r.status).toBe(200);
      expect(JSON.stringify(r.body)).not.toMatch(/pw_hash|password/i);
    }
    const bad = await rawCall("POST", "/api/login", { username: a.username, password: "wrong-password" });
    expect(bad.status).toBe(401);
  });

  it("validates sign-up: username rules, case-insensitive uniqueness, password length", async () => {
    const name = `Case${Date.now().toString(36)}`;
    expect((await rawCall("POST", "/api/signup", { username: "ab", password: "longenough" })).status).toBe(400);
    expect((await rawCall("POST", "/api/signup", { username: "has space", password: "longenough" })).status).toBe(400);
    expect((await rawCall("POST", "/api/signup", { username: "shortpw", password: "short" })).status).toBe(400);
    expect((await rawCall("POST", "/api/signup", { username: name, password: "longenough1" })).status).toBe(201);
    expect((await rawCall("POST", "/api/signup", { username: name.toLowerCase(), password: "longenough1" })).status).toBe(409);
    // boards live at /<username>, so names of the app's own pages are taken
    expect((await rawCall("POST", "/api/signup", { username: "settings", password: "longenough1" })).status).toBe(409);
  });

  it("lets markers in with the demo accounts, whose password can't be changed", async () => {
    const demo = await login("demo1", process.env.DEMO_PASSWORD ?? "postit-demo");
    const r = await demo.call("POST", "/api/me/password", { current: demo.password, password: "something-new" });
    expect(r.status).toBe(403);
  });
});
