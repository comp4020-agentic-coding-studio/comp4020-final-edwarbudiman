import { describe, expect, it } from "vitest";
import { signup } from "./helpers.ts";

// The sidebar: the channels you're in and the people you've visited, each
// with how many notes are new to you since you last looked.

const name = (p: string) => `${p} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

describe("sidebar", () => {
  it("counts notes others add to a channel until you open it, and never your own", async () => {
    const a = await signup("a");
    const b = await signup("b");
    const slug = (await a.call("POST", "/api/channels", { name: name("room"), description: "for testing" })).body.board.slug;
    const { board } = (await b.call("GET", `/api/boards/channel/${slug}`)).body; // b joins
    const unread = async (who: typeof a) => (await who.call("GET", "/api/sidebar")).body.channels.find((c: any) => c.slug === slug)?.unread;

    expect(await unread(b)).toBe(0);
    await a.call("POST", `/api/boards/${board.id}/notes`, { text: "one" });
    await a.call("POST", `/api/boards/${board.id}/notes`, { text: "two" });
    await b.call("POST", `/api/boards/${board.id}/notes`, { text: "mine" });
    expect(await unread(b)).toBe(2);
    expect(await unread(a)).toBe(1);

    await b.call("GET", `/api/boards/channel/${slug}`); // opening it catches you up
    expect(await unread(b)).toBe(0);
    const row = (await b.call("GET", "/api/sidebar")).body.channels.find((c: any) => c.slug === slug);
    expect(row).toMatchObject({ description: "for testing", members: 2, isOwner: false });
  });

  it("lists people once you've visited them, hides private notes meant for someone else, and forgets on request", async () => {
    const a = await signup("a");
    const b = await signup("b");
    const c = await signup("c");
    const person = async (who: typeof a, u: string) => (await who.call("GET", "/api/sidebar")).body.people.find((p: any) => p.username === u);

    expect(await person(a, a.username)).toMatchObject({ unread: 0 }); // your own board is always there
    expect(await person(c, b.username)).toBeUndefined();
    const { board } = (await c.call("GET", `/api/boards/user/${b.username}`)).body;
    expect(await person(c, b.username)).toMatchObject({ unread: 0 });

    await a.call("POST", `/api/boards/${board.id}/notes`, { text: "for b only", visibility: "private" });
    await a.call("POST", `/api/boards/${board.id}/notes`, { text: "for everyone" });
    expect((await person(c, b.username)).unread).toBe(1);
    expect((await person(b, b.username)).unread).toBe(2);

    expect((await c.call("DELETE", `/api/sidebar/people/${b.username}`)).status).toBe(200);
    expect(await person(c, b.username)).toBeUndefined();
    expect((await c.call("DELETE", `/api/sidebar/people/${c.username}`)).status).toBe(400);
  });

  it("lets members leave a channel, but not the person who made it", async () => {
    const a = await signup("a");
    const b = await signup("b");
    const slug = (await a.call("POST", "/api/channels", { name: name("bye") })).body.board.slug;
    await b.call("GET", `/api/boards/channel/${slug}`);
    expect((await b.call("POST", `/api/channels/${slug}/leave`)).status).toBe(200);
    expect((await b.call("GET", "/api/sidebar")).body.channels.find((c: any) => c.slug === slug)).toBeUndefined();
    expect((await a.call("POST", `/api/channels/${slug}/leave`)).status).toBe(400);
  });
});
