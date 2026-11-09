import { readdirSync, readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { TOKEN_ROUTES, TOOLS } from "../server/src/agent.ts";
import { baseUrl } from "./helpers.ts";

// /openapi.json describes the one token-authed route (POST /mcp) and /llms.txt
// says when to use Post-its. Both are built from server/src/openapi.ts.

const get = (path: string, headers: Record<string, string> = {}) => fetch(new URL(path, baseUrl), { headers });
const spec = await (await get("/openapi.json")).json();
const origin = (await (await get("/robots.txt")).text()).match(/^Sitemap: (https?:\/\/.+)\/sitemap\.xml$/m)?.[1] ?? "";

it("/openapi.json is OpenAPI 3.1 JSON with the server origin and bearer auth", async () => {
  const res = await get("/openapi.json");
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toMatch(/^application\/json/);
  expect(spec.openapi).toBe("3.1.0");
  expect(spec.servers).toEqual([{ url: origin }]);
  expect(spec.components.securitySchemes.bearerAuth).toMatchObject({ type: "http", scheme: "bearer" });
});

it("every operation has a unique operationId, a summary, a description and typed responses", () => {
  const ids: string[] = [];
  for (const [path, item] of Object.entries<any>(spec.paths)) {
    for (const [method, op] of Object.entries<any>(item)) {
      const where = `${method} ${path}`;
      ids.push(op.operationId);
      expect(op.operationId, where).toMatch(/^[A-Za-z][A-Za-z0-9]*$/);
      expect(op.summary, where).toBeTruthy();
      expect(op.description, where).toBeTruthy();
      expect(op.requestBody.content["application/json"].schema, where).toBeDefined();
      expect(Object.keys(op.responses), where).toContain("200");
    }
  }
  expect(new Set(ids).size).toBe(ids.length);
});

it("drift: every token route is in the spec, and no route outside TOKEN_ROUTES takes a token", () => {
  // 1. each registered token route is a path + method in the spec, with its operationId
  for (const r of TOKEN_ROUTES) {
    const op = spec.paths[r.path]?.[r.method.toLowerCase()];
    expect(op, `${r.method} ${r.path} is missing from /openapi.json`).toBeDefined();
    expect(op.operationId).toBe(r.operationId);
  }
  expect(Object.values<any>(spec.paths).flatMap((item) => Object.keys(item)).length).toBe(TOKEN_ROUTES.length);

  // 2. requireUserAny (the one check that accepts a bearer token) is called only
  // by handlers registered in TOKEN_ROUTES. Each call site is in agent.ts, and
  // there are as many as there are routes: a token route added anywhere else, or
  // without being listed, adds a call site and fails here.
  const dir = new URL("../server/src/", import.meta.url);
  const sites = readdirSync(dir)
    .filter((f) => f.endsWith(".ts"))
    .flatMap((f) => (readFileSync(new URL(f, dir), "utf8").match(/\brequireUserAny\(/g) ?? []).map(() => f))
    .filter((f) => f !== "auth.ts"); // auth.ts only defines it
  expect(sites, "requireUserAny is called outside agent.ts, or by more handlers than TOKEN_ROUTES lists").toEqual(TOKEN_ROUTES.map(() => "agent.ts"));
});

it("drift: the spec describes every MCP tool with its own input schema", () => {
  const messages = spec.components.schemas.RpcMessage.oneOf;
  const described = messages.filter((s: any) => s.properties.method.const === "tools/call").map((s: any) => s.properties.params.properties.name.const);
  expect(described.sort()).toEqual(TOOLS.map((t) => t.name).sort());
  for (const tool of TOOLS) {
    const s = messages.find((o: any) => o.title === tool.name);
    expect(s.properties.params.properties.arguments, tool.name).toEqual(JSON.parse(JSON.stringify(tool.inputSchema)));
  }
});

it("the request schema takes one message or a batch of 1 to 20, and a notification needs no id", () => {
  const { RpcRequest, RpcMessage, RpcResponse } = spec.components.schemas;
  expect(RpcRequest.oneOf).toContainEqual({ type: "array", minItems: 1, maxItems: 20, items: { $ref: "#/components/schemas/RpcMessage" } });
  expect(RpcResponse.oneOf.some((s: any) => s.type === "array" && s.maxItems === 20)).toBe(true);
  for (const m of RpcMessage.oneOf) expect(m.required).not.toContain("id");
});

it("/openapi.json is vnd.oai.openapi+json when asked for, application/json otherwise, and varies on Accept", async () => {
  const asked = await get("/openapi.json", { accept: "application/vnd.oai.openapi+json" });
  expect(asked.headers.get("content-type")).toMatch(/^application\/vnd\.oai\.openapi\+json/);
  expect(asked.headers.get("vary")).toMatch(/accept/i);
  expect((await asked.json()).openapi).toBe("3.1.0");
  for (const accept of ["*/*", "application/json", "text/html", "application/vnd.oai.openapi+json;q=0"]) {
    const res = await get("/openapi.json", { accept });
    expect(res.headers.get("content-type"), accept).toMatch(/^application\/json/);
    expect(res.headers.get("vary"), accept).toMatch(/accept/i);
  }
});

it("/llms.txt has the H1, a summary, when to use (and not), and the links", async () => {
  const res = await get("/llms.txt");
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toMatch(/^text\/plain/);
  const text = await res.text();
  expect(text).toMatch(/^# Post-its\n\n> .+/);
  expect(text).toContain("## When to use Post-its");
  expect(text).toMatch(/Don't use it/);
  for (const p of ["/docs/", "/openapi.json", "/mcp", "/sitemap.xml"]) expect(text).toContain(`](${origin}${p})`);
});

it("both are linked: Link header, sitemap and the homepage text; POST is 405, not the shell", async () => {
  const link = (await get("/", { accept: "text/html" })).headers.get("link");
  expect(link).toContain('</openapi.json>; rel="service-desc"; type="application/json"');
  const sitemap = await (await get("/sitemap.xml")).text();
  expect(sitemap).toContain(`<loc>${origin}/openapi.json</loc>`);
  expect(sitemap).toContain(`<loc>${origin}/llms.txt</loc>`);
  const home = await (await get("/", { accept: "text/html" })).text();
  expect(home).toContain('href="/openapi.json"');
  expect((await fetch(new URL("/openapi.json", baseUrl), { method: "POST" })).status).toBe(405);
});
