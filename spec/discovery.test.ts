import { existsSync, readdirSync, readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { baseUrl, boardOf, signup } from "./helpers.ts";

// What an agent pointed at Post-its finds (server/src/discovery.ts). Absolute
// URLs are built from the server's PUBLIC_ORIGIN, which may or may not be the
// address the spec reaches it at, so the spec reads the origin back from
// robots.txt and checks every other page agrees with it. Pages are fetched by
// path.

const get = (path: string, headers: Record<string, string> = {}) => fetch(new URL(path, baseUrl), { headers, redirect: "manual" });
const MD = { accept: "text/markdown" };
const BROWSER = { accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" };
const origin = (await (await get("/robots.txt")).text()).match(/^Sitemap: (https?:\/\/.+)\/sitemap\.xml$/m)?.[1] ?? "";

it("the origin in robots.txt is a plain origin, equal to PUBLIC_ORIGIN when the spec is given it", () => {
  expect(origin).toMatch(/^https?:\/\/[^/]+$/);
  if (process.env.PUBLIC_ORIGIN) expect(origin).toBe(process.env.PUBLIC_ORIGIN.replace(/\/+$/, ""));
});

it("/robots.txt is one open group with the content signal, the private paths and the sitemap", async () => {
  const res = await get("/robots.txt");
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
  const body = await res.text();
  expect(body.match(/^User-agent:/gim)).toHaveLength(1);
  expect(body).toContain("User-agent: *\nContent-Signal: search=yes, ai-input=yes, ai-train=yes\nAllow: /\nDisallow: /api/\nDisallow: /mcp\n");
  expect(body).toContain(`Sitemap: ${origin}/sitemap.xml`);
});

it("absolute URLs come from PUBLIC_ORIGIN, never from the request's Host or forwarded headers", async () => {
  const res = await get("/robots.txt", { "x-forwarded-host": "evil.example", "x-forwarded-proto": "ftp" });
  expect(await res.text()).not.toContain("evil.example");
});

it("/sitemap.xml lists /readme/ and the current docs, and every listed page answers 200", async () => {
  const res = await get("/sitemap.xml");
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toMatch(/^application\/xml/);
  const xml = await res.text();
  expect(xml).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9">/);
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  expect(urls).toContain(`${origin}/readme/`);
  expect(urls).toContain(`${origin}/docs/`);
  expect(urls.some((u) => u.startsWith(`${origin}/docs/features/`))).toBe(true);
  for (const u of urls) {
    const path = u.slice(origin.length);
    expect(path === "/readme/" || path.startsWith("/docs/"), path).toBe(true);
    // no old doc versions, no boards, no app pages
    expect(path, path).not.toMatch(/^\/docs\/v\d/);
    expect(path, path).not.toMatch(/versions/);
    for (const [h, type] of [[{}, "text/html"], [MD, "text/markdown"]] as const) {
      const page = await get(path, h);
      expect(page.status, path).toBe(200);
      expect(page.headers.get("content-type"), path).toMatch(new RegExp(`^${type}`));
    }
  }
});

it("Accept: text/markdown on /, /readme/ and a docs page returns Markdown with Vary: Accept", async () => {
  for (const path of ["/", "/readme/", "/docs/", "/docs/features/notes/"]) {
    const res = await get(path, MD);
    expect(res.status, path).toBe(200);
    expect(res.headers.get("content-type"), path).toBe("text/markdown; charset=utf-8");
    expect(res.headers.get("vary"), path).toBe("Accept");
    expect(await res.text(), path).toMatch(/^# /m);
  }
});

it("the .md URLs return the same Markdown whatever Accept says", async () => {
  const pairs: [string, string][] = [["/index.md", "/"], ["/readme.md", "/readme/"], ["/docs/index.md", "/docs/"], ["/docs/features/notes.md", "/docs/features/notes/"], ["/docs/features.md", "/docs/features/"]];
  for (const [twin, page] of pairs) {
    const viaTwin = await get(twin, BROWSER);
    expect(viaTwin.status, twin).toBe(200);
    expect(viaTwin.headers.get("content-type"), twin).toBe("text/markdown; charset=utf-8");
    expect(viaTwin.headers.get("vary"), twin).toBe("Accept");
    expect(await viaTwin.text(), twin).toBe(await (await get(page, MD)).text());
  }
});

it("/readme and /docs/** serve the Markdown source from disk, without front matter or HTML conversion", async () => {
  expect(await (await get("/readme.md")).text()).toBe(readFileSync(new URL("../README.md", import.meta.url), "utf8"));
  const notes = await (await get("/docs/features/notes.md")).text();
  const source = readFileSync(new URL("../docs/site/features/notes.md", import.meta.url), "utf8");
  expect(source.endsWith(notes)).toBe(true);
  expect(notes).not.toMatch(/^---/);
  expect(notes).not.toContain("<h1");
});

it("an unknown .md twin is a 404 text/plain", async () => {
  for (const path of ["/docs/nope.md", "/docs/features/nope.md", "/docs/v0.1/index.md", "/docs/features/index.md", "/docs/a/b/c.md"]) {
    const res = await get(path);
    expect(res.status, path).toBe(404);
    expect(res.headers.get("content-type"), path).toMatch(/^text\/plain/);
  }
});

it("Markdown / is the fixed about page: identical with and without a session, no board data", async () => {
  const user = await signup("disc");
  const { board } = await boardOf(user, user.username);
  const note = await user.call("POST", `/api/boards/${board.id}/notes`, { text: `secret-note-${user.username}`, x: 10, y: 10 });
  expect(note.status).toBe(201);
  const anon = await (await get("/", MD)).text();
  const loggedIn = await (await get("/", { ...MD, cookie: user.cookie })).text();
  expect(loggedIn).toBe(anon);
  expect(anon).not.toContain(user.username);
  expect(anon).not.toContain("secret-note");
  expect(anon).toContain("](/readme/)");
  expect(anon).toContain("](/docs/)");
  expect(anon).toContain("](/sitemap.xml)");
  expect(await (await get("/index.md", { cookie: user.cookie })).text()).toBe(anon);
});

it("q-values decide: Markdown wins only when its q is at least HTML's", async () => {
  const cases: [string, boolean][] = [
    ["text/markdown", true],
    ["text/markdown, text/html", true],
    ["text/html, text/markdown", true],
    ["text/markdown;q=0.5, text/html;q=0.9", false],
    ["text/html;q=0.5, text/markdown;q=0.9", true],
    ["text/markdown;q=0", false],
    ["*/*", false],
    ["text/*", false],
    [BROWSER.accept, false],
    ["", false],
  ];
  for (const [accept, markdown] of cases) {
    const res = await get("/", accept ? { accept } : {});
    expect(res.headers.get("content-type")?.startsWith("text/markdown"), `Accept: ${accept}`).toBe(markdown);
    expect(res.headers.get("vary"), `Accept: ${accept}`).toBe("Accept");
  }
});

it("a browser still gets HTML on /, /readme/ and /docs/, with Vary and the Link headers", async () => {
  for (const path of ["/", "/readme/", "/docs/", "/docs/features/notes/"]) {
    const res = await get(path, BROWSER);
    expect(res.status, path).toBe(200);
    expect(res.headers.get("content-type"), path).toMatch(/^text\/html/);
    expect(res.headers.get("vary"), path).toBe("Accept");
  }
  const home = (await get("/", BROWSER)).headers.get("link");
  expect(home).toContain('</index.md>; rel="alternate"; type="text/markdown"');
  expect(home).toContain('</docs/>; rel="describedby"');
  expect((await get("/readme/", BROWSER)).headers.get("link")).toBe('</readme.md>; rel="alternate"; type="text/markdown"');
  expect((await get("/docs/", BROWSER)).headers.get("link")).toBe('</docs/index.md>; rel="alternate"; type="text/markdown"');
  expect((await get("/docs/features/notes/", BROWSER)).headers.get("link")).toBe('</docs/features/notes.md>; rel="alternate"; type="text/markdown"');
});

it("the about page describes the app today: sections, per-person status, visitable boards", () => {
  const about = readFileSync(new URL("../docs/agents/about.md", import.meta.url), "utf8");
  expect(about.toLowerCase()).not.toContain("label");
  expect(about).not.toContain("todo");
  expect(about).not.toContain("private to you until");
  expect(about).toContain("sections");
  expect(about).toContain("/<username>");
});

it("Link alternate is set only when the .md twin exists, and every sitemap page's target returns 200", async () => {
  for (const path of ["/docs/v0.1/", "/docs/nope/", "/docs/features/nope/"]) {
    const res = await get(path, BROWSER);
    expect(res.headers.get("link"), path).toBeNull();
  }
  const sitemap = await (await get("/sitemap.xml")).text();
  const paths = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(origin, ""));
  expect(paths.length).toBeGreaterThan(2);
  for (const path of paths) {
    const link = (await get(path, BROWSER)).headers.get("link") ?? "";
    const target = link.match(/<([^>]+)>; rel="alternate"/)?.[1];
    expect(target, path).toBeTruthy();
    expect((await get(target as string)).status, `${path} -> ${target}`).toBe(200);
  }
});

it("HEAD answers like GET without a body", async () => {
  for (const path of ["/robots.txt", "/sitemap.xml", "/index.md"]) {
    const res = await fetch(new URL(path, baseUrl), { method: "HEAD" });
    expect(res.status, path).toBe(200);
    expect(await res.text(), path).toBe("");
  }
});

it("unknown /.well-known paths are a 404 text/plain, not the app", async () => {
  for (const path of ["/.well-known/anything-unknown", "/.well-known/", "/.well-known", "/.well-known/a/b", "/.well-known/security.txt"]) {
    const res = await get(path);
    expect(res.status, path).toBe(404);
    expect(res.headers.get("content-type"), path).toMatch(/^text\/plain/);
    expect(await res.text(), path).not.toContain('id="root"');
  }
});

it("an unknown file at the root is a 404, and a path named like a file stem is the app's 404 page, not the file", async () => {
  expect((await get("/nope.txt")).status).toBe(404);
  for (const path of ["/robots.txt/x", "/robots"]) {
    const res = await get(path, BROWSER);
    expect(res.status, path).toBe(404); // no such user
    expect(res.headers.get("content-type"), path).toMatch(/^text\/html/);
  }
});

it("the app shell carries description, canonical and Open Graph tags built from PUBLIC_ORIGIN", async () => {
  const html = await (await get("/", BROWSER)).text();
  expect(html).toContain('id="root"');
  expect(html).toMatch(/<meta name="description" content="[^"]+"/);
  expect(html).toContain(`<link rel="canonical" href="${origin}/" />`);
  for (const p of ["og:title", "og:description", "og:type", "og:url"]) expect(html, p).toContain(`property="${p}"`);
  expect(html).toContain(`<meta property="og:url" content="${origin}/" />`);
});

it("the docs have an Agents section: navbar link, index, sitemap entry and .md twin, empty or not", async () => {
  const page = await get("/docs/agents/", BROWSER);
  expect(page.status).toBe(200);
  expect(page.headers.get("content-type")).toMatch(/^text\/html/);
  expect(await page.text()).toContain('<a class="navbar__item navbar__link navbar__link--active" href="/docs/agents/">Agents</a>');
  // the link is in the navbar of every docs page, not only its own
  expect(await (await get("/docs/features/notes/", BROWSER)).text()).toContain('href="/docs/agents/">Agents</a>');

  const twin = await get("/docs/agents.md");
  expect(twin.status).toBe(200);
  expect(twin.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
  expect(await twin.text()).toMatch(/^# Agents/);

  const urls = [...(await (await get("/sitemap.xml")).text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  expect(urls).toContain(`${origin}/docs/agents/`);

  // every page that exists in docs/site/agents/ is listed, renders, and has a twin
  const dir = new URL("../docs/site/agents/", import.meta.url);
  const slugs = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".md")).map((f) => f.slice(0, -3)).filter((s) => s !== "index") : [];
  for (const slug of slugs) {
    expect(urls, slug).toContain(`${origin}/docs/agents/${slug}/`);
    expect((await get(`/docs/agents/${slug}/`, BROWSER)).status, slug).toBe(200);
    const md = await get(`/docs/agents/${slug}.md`);
    expect(md.status, slug).toBe(200);
    expect(md.headers.get("content-type"), slug).toMatch(/^text\/markdown/);
    expect(await (await get("/docs/agents/", MD)).text(), slug).toContain(`/docs/agents/${slug}.md`);
  }
});
