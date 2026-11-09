import { readFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import { marked } from "marked";
import { config } from "./config.ts";
import { currentDocsMarkdown, docsMarkdownUrl } from "./docs.ts";
import { underPrefix } from "./routes.ts";

// What an agent pointed at Post-its finds: robots.txt, a sitemap, Markdown
// versions of /, /readme/ and /docs/**, and a real 404 under /.well-known.
// index.ts dispatches each path here by name (see routes.ts); nothing in this
// file is a catch-all, and none of it reads board data or a session.

const ORIGIN = config.publicOrigin;
const MD = "text/markdown; charset=utf-8";

const escapeXml = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function send(req: IncomingMessage, res: ServerResponse, status: number, type: string, body: string, extra: Record<string, string> = {}): void {
  const bytes = Buffer.from(body, "utf8");
  res.writeHead(status, { "content-type": type, "content-length": bytes.length, ...extra });
  res.end(req.method === "HEAD" ? undefined : bytes);
}

const sendMarkdown = (req: IncomingMessage, res: ServerResponse, body: string, extra: Record<string, string> = {}): void =>
  send(req, res, 200, MD, body, { vary: "Accept", "cache-control": "no-cache", ...extra });

const requestPath = (req: IncomingMessage): string => new URL(req.url ?? "/", "http://x").pathname;

/**
 * The one 404 for everything that isn't the app shell: `/.well-known/*`,
 * unknown files, /readme/x, /docs/x/, unknown .md twins and non-GET requests to
 * a path that doesn't exist. Markdown for a client that prefers it (with the
 * links an agent needs next), plain text otherwise. `Vary: Accept` either way,
 * since the body depends on it. The shell's own 404 is in static.ts and uses
 * `notFoundMarkdown` / `NOT_FOUND_VARY` from here.
 */
export function notFound(req: IncomingMessage, res: ServerResponse): void {
  if (prefersMarkdown(req.headers.accept)) return notFoundMarkdown(req, res);
  send(req, res, 404, "text/plain; charset=utf-8", "not found", { vary: "Accept" });
}

/** The Markdown 404: says nothing is here and where the docs, sitemap and home page are. */
export function notFoundMarkdown(req: IncomingMessage, res: ServerResponse): void {
  const shown = requestPath(req).replace(/[`\r\n]/g, "");
  const body = [
    "# Not found",
    "",
    `Nothing is at \`${shown}\` on Post-its: no board, page or file by that name.`,
    "",
    "Where to go next:",
    "",
    `- [Docs](${ORIGIN}/docs/): what each feature does and how the app is built`,
    `- [Sitemap](${ORIGIN}/sitemap.xml): every public page, as a list`,
    `- [Home, as Markdown](${ORIGIN}/index.md): what Post-its is`,
    "",
  ].join("\n");
  send(req, res, 404, MD, body, { vary: "Accept", "cache-control": "no-cache" });
}

// ---------------------------------------------------------------- Accept

/**
 * True when the request prefers Markdown: `text/markdown` is listed and its q
 * is at least that of `text/html`. `*` and `text/*` don't count, so a client
 * that accepts anything still gets the page it would get today.
 */
export function prefersMarkdown(accept: string | undefined): boolean {
  if (!accept) return false;
  let md: number | undefined;
  let html: number | undefined;
  for (const part of accept.split(",")) {
    const [type, ...params] = part.trim().toLowerCase().split(";");
    const q = params.map((p) => p.trim().match(/^q=(\d*\.?\d+)$/)?.[1]).find((v) => v !== undefined);
    const weight = q === undefined ? 1 : Math.min(1, Number(q));
    if (type.trim() === "text/markdown") md = Math.max(md ?? 0, weight);
    else if (type.trim() === "text/html") html = Math.max(html ?? 0, weight);
  }
  return md !== undefined && md > 0 && md >= (html ?? 0);
}

// ---------------------------------------------------------------- content

const readmeMarkdown = (): Promise<string> => readFile(join(config.rootDir, "README.md"), "utf8");
const aboutMarkdown = (): Promise<string> => readFile(join(config.rootDir, "docs", "agents", "about.md"), "utf8");

/** The Link header on the HTML pages: where the Markdown and the docs are. */
export const LINK_HOME = `</index.md>; rel="alternate"; type="text/markdown", </docs/>; rel="describedby", </openapi.json>; rel="service-desc"; type="application/json"`;
export const linkAlternate = (mdUrl: string): string => `<${mdUrl}>; rel="alternate"; type="text/markdown"`;

// ---------------------------------------------------------------- the HTML shell's head

const TITLE = "Post-its";
const DESCRIPTION = "A board for your notes. Put them wherever you like: where a note sits is how you prioritise and group it. Visit other boards and see who's there.";
const KEYWORDS = "notes, post-its, sticky notes, board, productivity, to-do";
// hero.webp is on an existing route (serveReadme's image passthrough); its real size is 1200x525
const IMAGE = { url: `${ORIGIN}/readme/docs/readme-assets/hero.webp`, width: 1200, height: 525, type: "image/webp", alt: "A Post-its board: notes placed freely, grouped by where they sit" };
// the repo is public (gh repo view --json visibility); drop this if that changes
const REPO_URL = "https://github.com/comp4020-agentic-coding-studio/comp4020-final-edwarbudiman";

/** JSON for a <script> block: `<` is escaped so no string can close the tag. */
const jsonForScript = (value: unknown): string => JSON.stringify(value).replace(/</g, "\\u003c");

const homeJsonLd = (): string =>
  jsonForScript({
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: TITLE,
    description: DESCRIPTION,
    url: `${ORIGIN}/`,
    image: IMAGE.url,
    applicationCategory: "ProductivityApplication",
    operatingSystem: "Any",
    browserRequirements: "Requires JavaScript",
    offers: { "@type": "Offer", price: "0", priceCurrency: "AUD" },
    keywords: KEYWORDS,
    sameAs: [REPO_URL],
  });

export interface HeadOptions {
  /** The request's pathname. */
  path: string;
  /** 404 shells get no canonical and no og:url: they aren't pages. */
  status: 200 | 404;
}

const HEAD_TAGS = ({ path, status }: HeadOptions): string => {
  // one canonical per page: no trailing slash, and a board's name in lower case
  const trimmed = path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
  const own = trimmed.split("/").length === 2 ? trimmed.toLowerCase() : trimmed;
  const self = path === "/" ? `${ORIGIN}/` : `${ORIGIN}${own}`;
  const tags = [
    `<meta name="description" content="${escapeXml(DESCRIPTION)}" />`,
    ...(status === 200 ? [`<link rel="canonical" href="${escapeXml(self)}" />`] : []),
    `<meta property="og:title" content="${escapeXml(TITLE)}" />`,
    `<meta property="og:description" content="${escapeXml(DESCRIPTION)}" />`,
    `<meta property="og:type" content="website" />`,
    ...(status === 200 ? [`<meta property="og:url" content="${escapeXml(self)}" />`] : []),
    `<meta property="og:image" content="${escapeXml(IMAGE.url)}" />`,
    `<meta property="og:image:width" content="${IMAGE.width}" />`,
    `<meta property="og:image:height" content="${IMAGE.height}" />`,
    `<meta property="og:image:type" content="${IMAGE.type}" />`,
    `<meta property="og:image:alt" content="${escapeXml(IMAGE.alt)}" />`,
  ];
  if (path === "/" && status === 200) tags.push(`<script type="application/ld+json">${homeJsonLd()}</script>`);
  return tags.join("\n    ");
};

/** Add the description, canonical, Open Graph tags (and on `/`, the JSON-LD) to the built index.html. */
export const injectHead = (html: string, opts: HeadOptions): string => html.replace("</head>", `  ${HEAD_TAGS(opts)}\n  </head>`);

// ---------------------------------------------------------------- text inside #root

// Rendered once at startup. React's createRoot().render() replaces it on mount
// (no hydrateRoot), so people with JavaScript see the app; crawlers and agents
// that don't run it see this.
const homeHtml: string = await aboutMarkdown().then((md) => marked.parse(md, { gfm: true })).catch(() => "");

const escapeHtml = escapeXml;

/** Put server-rendered text inside the shell's empty #root. */
// A 404 shell marks #root with data-status="404": the client reads it before it
// replaces #root, so a logged-out visitor sees "No such board" and not a login page.
export const fillRoot = (html: string, inner: string, status: 200 | 404 = 200): string =>
  html.replace('<div id="root"></div>', () => `<div id="root"${status === 404 ? ' data-status="404"' : ""}>${inner}</div>`);

export const homeRoot = (): string => `<main>${homeHtml}</main>`;

/** What #root holds on a 404 shell, until the app mounts and shows its own "not found" view. */
export const notFoundRoot = (path: string): string => {
  let shown = path;
  try {
    shown = decodeURIComponent(path);
  } catch {
    /* show it as sent */
  }
  return `<main><h1>No such board</h1><p>There's no board or page at <code>${escapeHtml(shown)}</code>.</p>` +
  `<ul><li><a href="/">Post-its home</a></li><li><a href="/readme/">README</a></li><li><a href="/docs/">Docs</a></li></ul></main>`;
};

// ---------------------------------------------------------------- handlers

export function serveRobots(req: IncomingMessage, res: ServerResponse): void {
  const body = [
    "User-agent: *",
    "Content-Signal: search=yes, ai-input=yes, ai-train=yes",
    "Allow: /",
    "Disallow: /api/",
    "Disallow: /mcp",
    "",
    `Sitemap: ${ORIGIN}/sitemap.xml`,
    "",
  ].join("\n");
  send(req, res, 200, "text/plain; charset=utf-8", body, { "cache-control": "public, max-age=300" });
}

export async function serveSitemap(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const paths = ["/readme/", ...(await currentDocsMarkdown()).keys(), "/openapi.json", "/llms.txt"];
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths
    .map((p) => `  <url><loc>${escapeXml(ORIGIN + p)}</loc></url>`)
    .join("\n")}\n</urlset>\n`;
  send(req, res, 200, "application/xml; charset=utf-8", body, { "cache-control": "public, max-age=300" });
}

/**
 * The one place a page's Markdown is chosen. `htmlPath` is the page's HTML path
 * (/, /readme/, /docs/features/notes/). Returns the body and the URL of its
 * `.md` twin, or undefined when that page has no Markdown (older doc versions,
 * unknown paths). Negotiation and the `.md` routes both go through here.
 */
async function markdownFor(htmlPath: string): Promise<{ body: string; twin: string } | undefined> {
  if (htmlPath === "/") return { body: await aboutMarkdown(), twin: "/index.md" };
  if (htmlPath === "/readme/") return { body: await readmeMarkdown(), twin: "/readme.md" };
  if (!underPrefix(htmlPath, "docs") || !htmlPath.endsWith("/")) return undefined;
  const body = (await currentDocsMarkdown()).get(htmlPath);
  return body === undefined ? undefined : { body, twin: docsMarkdownUrl(htmlPath) };
}

/** The HTML path a `.md` URL is the twin of: /docs/features/notes.md -> /docs/features/notes/. */
const htmlPathOfTwin = (mdPath: string): string =>
  mdPath === "/index.md" ? "/" : mdPath === "/readme.md" ? "/readme/" : mdPath === "/docs/index.md" ? "/docs/" : `${mdPath.slice(0, -".md".length)}/`;

/** /index.md, /readme.md and /docs/<path>.md: the same bytes whatever the Accept header says. */
export async function serveMarkdownTwin(req: IncomingMessage, res: ServerResponse, path: string): Promise<void> {
  const page = await markdownFor(htmlPathOfTwin(path));
  // only the HTML path's own twin exists: /docs/features/index.md is not one
  if (!page || page.twin !== path) return notFound(req, res);
  sendMarkdown(req, res, page.body);
}

/**
 * Called before the HTML handlers for /, /readme/ and /docs/**. Answers with
 * Markdown when the client prefers it; otherwise sets the headers the HTML
 * response should carry and returns false so the caller serves it. `Link` goes
 * out only when the page's `.md` twin exists.
 */
export async function negotiate(req: IncomingMessage, res: ServerResponse, path: string): Promise<boolean> {
  if (path !== "/" && path !== "/readme/" && !(underPrefix(path, "docs") && path.endsWith("/"))) return false;
  const page = await markdownFor(path);
  if (page && prefersMarkdown(req.headers.accept)) return sendMarkdown(req, res, page.body), true;
  res.setHeader("vary", "Accept");
  if (page) res.setHeader("link", path === "/" ? LINK_HOME : linkAlternate(page.twin));
  return false;
}
