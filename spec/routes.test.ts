import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { RESERVED_USERNAMES } from "../server/src/auth.ts";
import * as client from "../client/src/routes.ts";
import * as server from "../server/src/routes.ts";
import { baseUrl, rawCall, uniqueName } from "./helpers.ts";

// Top-level paths are named in the server's dispatch, the Vite dev proxy, the
// SPA's page list and the reserved usernames. When they drift, a page opens as
// somebody's board in dev (this happened with /docs). See server/src/routes.ts
// for how to add one.

const read = (p: string): string => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const indexSrc = read("server/src/index.ts");
const mainSrc = read("client/src/main.tsx");

it("the client's route lists equal the server's", () => {
  expect([...client.SERVER_PAGES]).toEqual([...server.SERVER_PAGES]);
  expect([...client.SERVER_ENDPOINTS]).toEqual([...server.SERVER_ENDPOINTS]);
  expect([...client.SPA_PAGES]).toEqual([...server.SPA_PAGES]);
  expect([...client.SERVER_FILES]).toEqual([...server.SERVER_FILES]);
  expect([...client.SERVER_DOT_DIRS]).toEqual([...server.SERVER_DOT_DIRS]);
});

it("every page the server renders is dispatched in index.ts, and index.ts renders no other", () => {
  const dispatched = [...indexSrc.matchAll(/underPrefix\(path,\s*"([^"]+)"\)/g)].map((m) => m[1]).sort();
  expect(dispatched).toEqual([...server.SERVER_PAGES, ...server.SERVER_DOT_DIRS].sort());
  // every root file is dispatched by an exact comparison, never left to the SPA
  for (const name of server.SERVER_FILES) expect(indexSrc, name).toContain(`"/${name}"`);
  // no hand-written prefix check slipped in beside underPrefix
  expect(indexSrc).not.toMatch(/path\.startsWith\("\/(?!api\/)/);
  expect(indexSrc).toMatch(/path\.startsWith\("\/api\/"\)/);
  expect(indexSrc).toMatch(/path === "\/healthz"/);
});

it("the WebSocket path in realtime.ts is a listed server endpoint", () => {
  const ws = read("server/src/realtime.ts").match(/path !== "\/([a-z]+)"/)?.[1];
  expect(ws).toBeDefined();
  expect(server.SERVER_ENDPOINTS as readonly string[]).toContain(ws);
});

it("every server path has an anchored Vite proxy key, and every key is anchored", async () => {
  // the real dev config, not its source text
  const config = (await import("../client/vite.config.ts")).default as { server?: { proxy?: Record<string, unknown> } };
  const keys = Object.keys(config.server?.proxy ?? {});
  const all = [...client.SERVER_ENDPOINTS, ...client.SERVER_PAGES];
  expect(keys.sort()).toEqual(
    [...all.map(client.proxyKey), ...client.SERVER_FILES.map(client.fileProxyKey), ...client.SERVER_DOT_DIRS.map(client.dotDirProxyKey)].sort(),
  );
  for (const key of keys) expect(key, "proxy keys must be anchored RegExps").toMatch(/^\^\/[a-z.\\-]+(\(\/\|\$\)|\$)$/);
  for (const name of client.SERVER_FILES) {
    const re = new RegExp(client.fileProxyKey(name));
    expect(re.test(`/${name}`), name).toBe(true);
    expect(re.test(`/${name}x`), `${name}x must stay a board`).toBe(false);
    expect(re.test(`/${name}/x`), `${name}/x must stay a board`).toBe(false);
  }
  for (const name of client.SERVER_DOT_DIRS) {
    const re = new RegExp(client.dotDirProxyKey(name));
    expect(re.test(`/${name}`), name).toBe(true);
    expect(re.test(`/${name}/x`), name).toBe(true);
    expect(re.test(`/${name}x`), `${name}x must stay a board`).toBe(false);
  }
  for (const name of all) {
    const re = new RegExp(client.proxyKey(name));
    expect(re.test(`/${name}`), name).toBe(true);
    expect(re.test(`/${name}/x`), name).toBe(true);
    expect(re.test(`/${name}-x`), `${name}-x must stay a board`).toBe(false);
    expect(re.test(`/${name}x`), `${name}x must stay a board`).toBe(false);
  }
});

it("the SPA's page list and server-page redirect are built from the shared lists", () => {
  expect(mainSrc).toMatch(/\[\.\.\.SPA_PAGES,\s*\.\.\.SERVER_PAGES\]/);
  expect(mainSrc).toMatch(/SERVER_PAGES\.join\("\|"\)/);
});

it("every server and SPA top-level name is a reserved username", () => {
  for (const name of [...server.SERVER_PAGES, ...server.SERVER_ENDPOINTS, ...server.SERVER_FILES, ...server.SERVER_DOT_DIRS, ...server.SPA_PAGES, ...client.SPA_PAGES]) {
    expect(RESERVED_USERNAMES.has(name), `${name} is not reserved`).toBe(true);
  }
});

it("each server page answers with the server's page, not the SPA shell", async () => {
  for (const name of server.SERVER_PAGES) {
    for (const path of [`/${name}/`, `/${name}`]) {
      const res = await fetch(new URL(path, baseUrl), { redirect: "follow" });
      expect(res.status, path).toBe(200);
      const html = await res.text();
      expect(html, path).not.toContain('id="root"');
    }
  }
  expect((await fetch(new URL("/healthz", baseUrl))).status).toBe(200);
  // the API owns /api/: an unknown endpoint is JSON 404, never the SPA
  expect((await rawCall("GET", "/api/nope")).status).toBe(404);
});

it("usernames that merely start with a server path are valid, and the reserved ones are taken", async () => {
  for (const name of [...server.SERVER_PAGES, ...server.SERVER_ENDPOINTS, ...server.SERVER_FILES, ...server.SERVER_DOT_DIRS, ...server.SPA_PAGES]) {
    const reserved = await rawCall("POST", "/api/signup", { username: name, password: "password-123" });
    // names under 3 characters (ws) or with a dot (robots.txt) can't be registered anyway: 400 from the name rule
    expect(reserved.status, `${name} must not be registrable`).toBe(name.length < 3 || name.includes(".") ? 400 : 409);
  }
  for (const stem of server.SERVER_PAGES) {
    const username = `${stem}-${uniqueName("x").slice(0, 5)}`;
    const ok = await rawCall("POST", "/api/signup", { username, password: "password-123" });
    expect(ok.status, `${username} must be allowed`).toBe(201);
  }
});
