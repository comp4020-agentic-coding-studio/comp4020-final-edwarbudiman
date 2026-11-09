import { expect, it } from "vitest";
import { TOOLS } from "../server/src/agent.ts";
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

it("drift: the spec covers exactly the token routes and every MCP tool", () => {
  // the only route requireUserAny accepts a bearer token on is /mcp
  expect(Object.keys(spec.paths)).toEqual(["/mcp"]);
  expect(Object.keys(spec.paths["/mcp"])).toEqual(["post"]);
  const described = spec.components.schemas.RpcRequest.oneOf
    .filter((s: any) => s.properties.method.const === "tools/call")
    .map((s: any) => s.properties.params.properties.name.const);
  expect(described.sort()).toEqual(TOOLS.map((t) => t.name).sort());
  for (const tool of TOOLS) {
    const s = spec.components.schemas.RpcRequest.oneOf.find((o: any) => o.title === tool.name);
    expect(s.properties.params.properties.arguments, tool.name).toEqual(JSON.parse(JSON.stringify(tool.inputSchema)));
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
