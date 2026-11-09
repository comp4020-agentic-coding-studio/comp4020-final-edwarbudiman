import { expect, it } from "vitest";
import { baseUrl, signup, uniqueName } from "./helpers.ts";

// What an agent or crawler gets from a path that doesn't exist, and what the
// raw HTML of the app shell says without running any script (server/src/static.ts
// and discovery.ts). Absolute URLs come from PUBLIC_ORIGIN, read back from robots.txt.

const get = (path: string, headers: Record<string, string> = {}, method = "GET") => fetch(new URL(path, baseUrl), { method, headers, redirect: "manual" });
const MD = { accept: "text/markdown" };
const BROWSER = { accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" };
const origin = (await (await get("/robots.txt")).text()).match(/^Sitemap: (https?:\/\/.+)\/sitemap\.xml$/m)?.[1] ?? "";

const user = await signup("rdy");
const channel = (await user.call("POST", "/api/channels", { name: uniqueName("rdychan"), visibility: "public" })).body.board.slug as string;

const root = (html: string): string => html.match(/<div id="root">([\s\S]*?)<\/div>\s*<noscript>/)?.[1] ?? "";
const visibleText = (html: string): string => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

it("Accept: text/markdown on a missing path is a 404 Markdown page that links the docs and sitemap", async () => {
  const paths = ["/this-page-does-not-exist-xyz", "/graphql", "/c/nope-xyz", "/foo/bar", "/.well-known/xyz", "/foo.php", "/readme/nope", "/docs/nope/", "/admin", "/about", "/c/nope-xyz/"];
  for (const path of paths) {
    const res = await get(path, MD);
    expect(res.status, path).toBe(404);
    expect(res.headers.get("content-type"), path).toBe("text/markdown; charset=utf-8");
    expect(res.headers.get("vary"), path).toBe("Accept");
    const body = await res.text();
    expect(body.length, path).toBeGreaterThanOrEqual(20);
    expect(body, path).toContain(`${origin}/docs/`);
    expect(body, path).toContain(`${origin}/sitemap.xml`);
    expect(body, path).toContain(`${origin}/index.md`);
  }
});

it("a method other than GET on a missing path is a 404, not a 405", async () => {
  for (const method of ["POST", "PUT", "DELETE", "PATCH"]) {
    const res = await get("/graphql", MD, method);
    expect(res.status, method).toBe(404);
    expect(res.headers.get("content-type"), method).toBe("text/markdown; charset=utf-8");
    expect(res.headers.get("vary"), method).toBe("Accept");
  }
  expect((await get("/graphql", {}, "POST")).status).toBe(404);
  expect((await get("/foo.php", {}, "POST")).status).toBe(404);
  // a path that exists still says 405
  expect((await get("/robots.txt", {}, "POST")).status).toBe(405);
  expect((await get(`/c/${channel}`, {}, "POST")).status).toBe(405);
  expect((await get("/api/nope", {}, "POST")).status).toBe(404);
});

it("without that header a missing page path is the app shell with status 404, 'No such board' in #root and no canonical", async () => {
  for (const path of ["/this-page-does-not-exist-xyz", "/foo/bar", "/c/nope-xyz", "/admin"]) {
    const res = await get(path, BROWSER);
    expect(res.status, path).toBe(404);
    expect(res.headers.get("content-type"), path).toMatch(/^text\/html/);
    expect(res.headers.get("vary"), path).toBe("Accept");
    const html = await res.text();
    expect(html, path).toContain('<script type="module"');
    expect(root(html), path).toContain("<h1>No such board</h1>");
    expect(root(html), path).toContain('href="/readme/"');
    expect(root(html), path).toContain('href="/docs/"');
    expect(html, path).not.toContain('rel="canonical"');
    expect(html, path).not.toContain("application/ld+json");
  }
});

it("the path shown on the 404 page is escaped", async () => {
  const res = await get("/%3Cscript%3Ealert(1)%3C%2Fscript%3E", BROWSER);
  expect(res.status).toBe(404);
  const html = await res.text();
  expect(html).not.toContain("<script>alert(1)");
  expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  const md = await (await get("/%60x%60", MD)).text();
  expect(md).not.toContain("`x`");
});

it("an extensioned missing file is a 404 with a small body, Markdown when asked, and Vary", async () => {
  const res = await get("/nope.js", BROWSER);
  expect(res.status).toBe(404);
  expect(res.headers.get("content-type")).toMatch(/^text\/plain/);
  expect(res.headers.get("vary")).toBe("Accept");
  expect(await res.text()).not.toContain('id="root"');
});

it("the 200 shells: /, boards, channels, app pages and old /u/ links", async () => {
  const cases = ["/", `/${user.username}`, `/${user.username}/`, `/${user.username.toUpperCase()}`, `/c/${channel}`, `/c/${channel}/`, "/settings", "/stats", "/login", "/signup", `/u/${user.username}`, "/demo1"];
  for (const path of cases) {
    const res = await get(path, BROWSER);
    expect(res.status, path).toBe(200);
    expect(res.headers.get("content-type"), path).toMatch(/^text\/html/);
    expect(res.headers.get("vary"), path).toBe("Accept");
    expect(await res.text(), path).toContain('id="root"');
  }
});

it("reserved names that aren't pages, and names that can't be usernames, are 404 (and never reach a board)", async () => {
  for (const path of ["/admin", "/about", "/logout", "/new", "/ab", "/a".repeat(30), "/has.dot", "/%ZZ", "/some%20thing"]) {
    expect((await get(path, BROWSER)).status, path).toBe(404);
  }
});

it("the /c/ and /u/ shells need the right shape", async () => {
  expect((await get("/c", BROWSER)).status).toBe(404);
  expect((await get(`/c/${channel}/x`, BROWSER)).status).toBe(404);
  expect((await get("/x/y", BROWSER)).status).toBe(404);
});

it("the raw HTML of / has an H1, 500+ characters, the links, og:image and one WebApplication JSON-LD", async () => {
  const res = await get("/", BROWSER);
  const html = await res.text();
  const inner = root(html);
  expect(inner).toMatch(/<h1[^>]*>Post-its<\/h1>/);
  expect(visibleText(inner).length).toBeGreaterThanOrEqual(500);
  for (const href of ["/readme/", "/docs/", "/sitemap.xml"]) expect(inner, href).toContain(`href="${href}"`);
  expect(html).toContain(`<meta property="og:image" content="${origin}/readme/docs/readme-assets/hero.webp" />`);
  expect(html).toContain('<meta property="og:image:width" content="1200" />');
  expect(html).toContain('<meta property="og:image:height" content="525" />');
  expect(html).toContain('<meta property="og:image:type" content="image/webp" />');
  expect(html).toMatch(/<meta property="og:image:alt" content="[^"]+" \/>/);

  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  expect(blocks).toHaveLength(1);
  const ld = JSON.parse(blocks[0][1]);
  expect(ld["@type"]).toBe("WebApplication");
  expect(ld.name).toBe("Post-its");
  expect(ld.url).toBe(`${origin}/`);
  expect(ld.description).toBe(html.match(/<meta name="description" content="([^"]+)"/)?.[1]);
  expect(ld.image).toBe(`${origin}/readme/docs/readme-assets/hero.webp`);
  expect(ld.offers).toEqual({ "@type": "Offer", price: "0", priceCurrency: "AUD" });
  expect(ld.keywords).toBeTruthy();
  expect(ld).not.toHaveProperty("aggregateRating");
  expect(ld).not.toHaveProperty("review");
});

it("the About text is the same for everyone and holds no board data", async () => {
  const other = await signup("rdy");
  const anon = root(await (await get("/", BROWSER)).text());
  const loggedIn = root(await (await get("/", { ...BROWSER, cookie: other.cookie })).text());
  expect(loggedIn).toBe(anon);
  expect(anon).not.toContain(other.username);
});

it("canonical: / keeps the home URL, other 200 shells point at themselves, and the query is dropped", async () => {
  expect(await (await get("/", BROWSER)).text()).toContain(`<link rel="canonical" href="${origin}/" />`);
  expect(await (await get("/?utm=x", BROWSER)).text()).toContain(`<link rel="canonical" href="${origin}/" />`);
  const board = await (await get(`/c/${channel}?x=1`, BROWSER)).text();
  expect(board).toContain(`<link rel="canonical" href="${origin}/c/${channel}" />`);
  expect(board).not.toContain(`href="${origin}/" />`.replace("href", 'rel="canonical" href'));
  expect(board).not.toContain("application/ld+json");
  expect(board).toContain(`<meta property="og:url" content="${origin}/c/${channel}" />`);
  expect(root(board)).toBe("");
  expect(await (await get("/settings", BROWSER)).text()).toContain(`<link rel="canonical" href="${origin}/settings" />`);
});

it("the <noscript> text links /readme/ and /docs/", async () => {
  const html = await (await get("/", BROWSER)).text();
  const noscript = html.match(/<noscript>([\s\S]*?)<\/noscript>/)?.[1] ?? "";
  expect(noscript).toContain('href="/readme/"');
  expect(noscript).toContain('href="/docs/"');
});

it("HEAD on a missing page is a 404 without a body", async () => {
  const res = await get("/this-page-does-not-exist-xyz", BROWSER, "HEAD");
  expect(res.status).toBe(404);
  expect(await res.text()).toBe("");
});
