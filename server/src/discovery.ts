import { readFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
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

export function notFound(req: IncomingMessage, res: ServerResponse): void {
  send(req, res, 404, "text/plain; charset=utf-8", "not found");
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
export const LINK_HOME = `</index.md>; rel="alternate"; type="text/markdown", </docs/>; rel="describedby"`;
export const linkAlternate = (mdUrl: string): string => `<${mdUrl}>; rel="alternate"; type="text/markdown"`;

// ---------------------------------------------------------------- the HTML shell's head

const HEAD_TAGS = (): string => {
  const title = "Post-its";
  const description = "A board for your notes. Put them wherever you like: where a note sits is how you prioritise and group it. Visit other boards and see who's there.";
  return [
    `<meta name="description" content="${escapeXml(description)}" />`,
    `<link rel="canonical" href="${escapeXml(ORIGIN)}/" />`,
    `<meta property="og:title" content="${escapeXml(title)}" />`,
    `<meta property="og:description" content="${escapeXml(description)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:url" content="${escapeXml(ORIGIN)}/" />`,
  ].join("\n    ");
};

/** Add the description, canonical and Open Graph tags to the built index.html. */
export const injectHead = (html: string): string => html.replace("</head>", `  ${HEAD_TAGS()}\n  </head>`);

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
  const paths = ["/readme/", ...(await currentDocsMarkdown()).keys()];
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
