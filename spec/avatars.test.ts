import { describe, expect, it } from "vitest";
import { boardOf, connect, signup } from "./helpers.ts";

// The 3D room: where each person stands is relayed to the others on the same
// board, held only in memory, and dropped when they leave the room.

describe("avatars in the 3D room", () => {
  it("relays where someone stands to the others in the room, not back to them", async () => {
    const [a, b] = [await signup("a"), await signup("b")];
    const { board } = await boardOf(a, a.username);
    const liveA = await connect(a, board.id);
    const liveB = await connect(b, board.id);
    try {
      liveA.send({ type: "avatar", x: 1.5, y: 0, z: -2, yaw: 0.3 });
      const seen = await liveB.next((m) => m.type === "avatar", 1000);
      expect(seen).toMatchObject({ name: a.username, x: 1.5, y: 0, z: -2, yaw: 0.3 });
      expect(typeof seen.sid).toBe("string");
      await new Promise((r) => setTimeout(r, 150));
      expect(liveA.messages.some((m) => m.type === "avatar")).toBe(false);
    } finally {
      await liveA.close();
      await liveB.close();
    }
  });

  it("shows someone arriving whoever is already standing in the room", async () => {
    const [a, b] = [await signup("a"), await signup("b")];
    const { board } = await boardOf(a, a.username);
    const liveA = await connect(a, board.id);
    try {
      liveA.send({ type: "avatar", x: 0, y: 0, z: 1, yaw: 0 });
      await new Promise((r) => setTimeout(r, 100));
      const liveB = await connect(b, board.id);
      try {
        const seen = await liveB.next((m) => m.type === "avatar", 1000);
        expect(seen).toMatchObject({ name: a.username, z: 1 });
      } finally {
        await liveB.close();
      }
    } finally {
      await liveA.close();
    }
  });

  it("removes the avatar when its owner goes back to the board or disconnects", async () => {
    const [a, b, c] = [await signup("a"), await signup("b"), await signup("c")];
    const { board } = await boardOf(a, a.username);
    const liveA = await connect(a, board.id);
    const liveB = await connect(b, board.id);
    const liveC = await connect(c, board.id);
    try {
      liveA.send({ type: "avatar", x: 0, y: 0, z: 0, yaw: 0 });
      const { sid } = await liveC.next((m) => m.type === "avatar", 1000);
      liveA.send({ type: "avatar:leave" });
      expect((await liveC.next((m) => m.type === "avatar:leave", 1000)).sid).toBe(sid);

      liveB.send({ type: "avatar", x: 0, y: 0, z: 0, yaw: 0 });
      const bSid = (await liveC.next((m) => m.type === "avatar", 1000)).sid;
      await liveB.close();
      expect((await liveC.next((m) => m.type === "avatar:leave", 1000)).sid).toBe(bSid);
    } finally {
      await liveA.close();
      await liveB.close();
      await liveC.close();
    }
  });

  it("ignores positions that aren't numbers or are far outside any room", async () => {
    const [a, b] = [await signup("a"), await signup("b")];
    const { board } = await boardOf(a, a.username);
    const liveA = await connect(a, board.id);
    const liveB = await connect(b, board.id);
    try {
      liveA.send({ type: "avatar", x: "1", y: 0, z: 0, yaw: 0 });
      await new Promise((r) => setTimeout(r, 80));
      liveA.send({ type: "avatar", x: 1e9, y: 0, z: 0, yaw: 0 });
      await new Promise((r) => setTimeout(r, 80));
      liveA.send({ type: "avatar", x: 2, y: 0, z: 0, yaw: 0 });
      const seen = await liveB.next((m) => m.type === "avatar", 1000);
      expect(seen.x).toBe(2);
    } finally {
      await liveA.close();
      await liveB.close();
    }
  });
});
