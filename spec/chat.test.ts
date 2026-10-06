import { describe, expect, it } from "vitest";
import { connect, signup } from "./helpers.ts";
import type { Client, Live } from "./helpers.ts";

// T26 (and T24/T25/F-01): channel chat is held by the peers in the room, not
// the server.

async function channel(owner: Client, ...others: Client[]): Promise<number> {
  const name = `chat ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const slug = (await owner.call("POST", "/api/channels", { name, visibility: "public" })).body.board.slug;
  let id = 0;
  for (const c of [owner, ...others]) id = (await c.call("GET", `/api/boards/channel/${slug}`)).body.board.id;
  return id;
}

/** Act as a client that holds the lines it has seen and shares them when asked. */
function holdAndShare(live: Live, opts: { declined?: boolean; forge?: boolean } = {}): void {
  const held: unknown[] = [];
  live.ws.on("message", (data) => {
    const m = JSON.parse(String(data));
    if (m.type === "chat:msg") held.push(m.line);
    if (m.type !== "chat:history:request") return;
    const lines = [...held];
    if (opts.forge) lines.push({ id: "forged", author: "someone-else", ts: Date.now(), text: "I never said this", sig: "AAAA" });
    live.send(opts.declined ? { type: "chat:history:reply", to: m.to, declined: true } : { type: "chat:history:reply", to: m.to, lines });
  });
}

describe("ephemeral, peer-held chat", () => {
  it("stamps, signs and relays a line to the room", async () => {
    const a = await signup("a");
    const b = await signup("b");
    const id = await channel(a, b);
    const la = await connect(a, id);
    const lb = await connect(b, id);
    try {
      la.send({ type: "chat:send", text: "hello room" });
      const got = await lb.next((m) => m.type === "chat:msg", 1000);
      expect(got.line).toMatchObject({ author: a.username, text: "hello room" });
      expect(typeof got.line.sig).toBe("string");
      expect(typeof got.line.ts).toBe("number");
    } finally {
      await la.close();
      await lb.close();
    }
  });

  it("hands history to a newcomer from a peer, dropping lines that don't verify", async () => {
    const a = await signup("a");
    const b = await signup("b");
    const c = await signup("c");
    const id = await channel(a, b, c);
    const la = await connect(a, id);
    holdAndShare(la, { forge: true });
    try {
      la.send({ type: "chat:send", text: "first" });
      la.send({ type: "chat:send", text: "second" });
      await la.next((m) => m.type === "chat:msg" && m.line.text === "second");

      const lc = await connect(c, id);
      try {
        const h = await lc.next((m) => m.type === "chat:history", 4000);
        const texts = h.lines.map((l: any) => l.text);
        expect(texts).toEqual(["first", "second"]);
        expect(texts).not.toContain("I never said this");
      } finally {
        await lc.close();
      }
    } finally {
      await la.close();
    }
  });

  it("asks the next peer when one declines to share (F-01)", async () => {
    const [a, b, c] = [await signup("a"), await signup("b"), await signup("c")];
    const id = await channel(a, b, c);
    const la = await connect(a, id);
    const lb = await connect(b, id);
    holdAndShare(la, { declined: true }); // oldest peer, asked first, says no
    holdAndShare(lb);
    try {
      la.send({ type: "chat:send", text: "kept by b" });
      await lb.next((m) => m.type === "chat:msg");
      const lc = await connect(c, id);
      try {
        const h = await lc.next((m) => m.type === "chat:history", 4000);
        expect(h.lines.map((l: any) => l.text)).toContain("kept by b");
      } finally {
        await lc.close();
      }
    } finally {
      await la.close();
      await lb.close();
    }
  });

  it("gives a newcomer no history once every member who saw it has left", async () => {
    const [a, b, c] = [await signup("a"), await signup("b"), await signup("c")];
    const id = await channel(a, b, c);
    const la = await connect(a, id);
    const lb = await connect(b, id);
    holdAndShare(la);
    holdAndShare(lb);
    la.send({ type: "chat:send", text: "gone soon" });
    await lb.next((m) => m.type === "chat:msg");
    await la.close();
    await lb.close();
    await new Promise((r) => setTimeout(r, 200));

    const lc = await connect(c, id);
    try {
      const h = await lc.next((m) => m.type === "chat:history", 4000);
      expect(h.lines).toEqual([]);
      expect(JSON.stringify(lc.messages)).not.toContain("gone soon");
    } finally {
      await lc.close();
    }
  });
});
