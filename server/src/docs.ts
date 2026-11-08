import { readdir, readFile, stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { basename, extname, join } from "node:path";
import { Marked } from "marked";
import { config } from "./config.ts";

/**
 * /docs/: the feature list and the agent pipeline, as a small Docusaurus-
 * looking site. It is Infima (Docusaurus's own CSS, vendored in docs/site/)
 * around Markdown rendered on the server, so every page is complete HTML with
 * no script and no build step.
 *
 * Pages are docs/site/<slug>.md and docs/site/features/<slug>.md. Each may
 * start with a front matter block:
 *
 *   ---
 *   title: Live cursors
 *   order: 3
 *   summary: one line for the features index
 *   image: feature-cursors.png      (docs/readme-assets/, optional)
 *   video: cursors-demo.mp4         (docs/readme-assets/, optional, wins over image)
 *   ---
 */

const SITE = () => join(config.rootDir, "docs", "site");
const ASSETS = () => join(config.rootDir, "docs", "readme-assets");

type Page = {
  slug: string;
  section: "" | "features";
  title: string;
  order: number;
  summary: string;
  /** file names in docs/readme-assets/, shown above the page body */
  image: string;
  video: string;
  body: string;
};

const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const slugify = (s: string): string =>
  s
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

function parsePage(raw: string, slug: string, section: Page["section"]): Page {
  const meta: Record<string, string> = {};
  let body = raw;
  const fm = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (fm) {
    for (const line of fm[1].split("\n")) {
      const m = line.match(/^(\w+):\s*(.*)$/);
      if (m) meta[m[1]] = m[2].trim();
    }
    body = raw.slice(fm[0].length);
  }
  const h1 = body.match(/^#\s+(.*)$/m)?.[1];
  return {
    slug,
    section,
    title: meta.title ?? h1 ?? slug,
    order: Number(meta.order ?? 100),
    summary: meta.summary ?? "",
    image: meta.image ?? "",
    video: meta.video ?? "",
    body,
  };
}

async function loadSection(section: Page["section"]): Promise<Page[]> {
  const dir = section ? join(SITE(), section) : SITE();
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const pages = await Promise.all(
    names
      .filter((n) => n.endsWith(".md") && !n.startsWith("."))
      .map(async (n) => parsePage(await readFile(join(dir, n), "utf8"), basename(n, ".md"), section)),
  );
  return pages.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}

const hrefOf = (p: Page): string =>
  p.section === "features" ? (p.slug === "index" ? "/docs/features/" : `/docs/features/${p.slug}/`) : p.slug === "index" ? "/docs/" : `/docs/${p.slug}/`;

/** Markdown to HTML with heading ids, collecting h2/h3 for the table of contents. */
async function render(md: string): Promise<{ html: string; toc: { depth: number; id: string; text: string }[] }> {
  const toc: { depth: number; id: string; text: string }[] = [];
  const seen = new Map<string, number>();
  const marked = new Marked({ gfm: true });
  marked.use({
    renderer: {
      heading({ tokens, depth }) {
        const inner = this.parser.parseInline(tokens);
        let id = slugify(inner) || "section";
        const n = seen.get(id) ?? 0;
        seen.set(id, n + 1);
        if (n) id = `${id}-${n}`;
        if (depth === 2 || depth === 3) toc.push({ depth, id, text: inner.replace(/<[^>]+>/g, "") });
        return `<h${depth} id="${id}" class="anchor">${inner}<a class="hash-link" href="#${id}" aria-label="Link to this heading">#</a></h${depth}>\n`;
      },
    },
  });
  const html = await marked.parse(md);
  return { html, toc };
}

function sidebar(general: Page[], features: Page[], current: string): string {
  const link = (p: Page) => {
    const href = hrefOf(p);
    const active = href === current ? " menu__link--active" : "";
    return `<li class="menu__list-item"><a class="menu__link${active}" href="${href}">${escapeHtml(p.title)}</a></li>`;
  };
  const group = (label: string, items: Page[]) =>
    `<li class="menu__list-item"><div class="menu__group">${label}</div><ul class="menu__list">${items.map(link).join("")}</ul></li>`;
  return `<nav class="menu thin-scrollbar" aria-label="Docs">
<ul class="menu__list">
${group("Features", features)}
${group("How it's built", general)}
</ul>
</nav>`;
}

const mediaSrc = (file: string) => `/docs/assets/${encodeURIComponent(file)}`;

/** The demo at the top of a feature page: a video if there is one, else the screenshot. */
function media(p: Page): string {
  if (p.video) {
    const poster = p.image ? ` poster="${mediaSrc(p.image)}"` : "";
    return `<figure class="feature-media"><video src="${mediaSrc(p.video)}"${poster} controls muted loop playsinline preload="metadata"></video></figure>`;
  }
  if (p.image) return `<figure class="feature-media"><img src="${mediaSrc(p.image)}" alt="${escapeHtml(p.title)}"></figure>`;
  return "";
}

function featureCards(features: Page[]): string {
  const items = features.filter((p) => p.slug !== "index");
  if (!items.length) return "<p>No features documented yet.</p>";
  return `<div class="row feature-cards">
${items
  .map(
    (p) => `<div class="col col--6 margin-bottom--lg"><a class="card feature-card" href="${hrefOf(p)}">
  ${p.image ? `<img class="feature-card__img" src="${mediaSrc(p.image)}" alt="" loading="lazy">` : ""}
  <div class="padding--lg"><h3>${escapeHtml(p.title)}</h3>
  <p>${escapeHtml(p.summary)}</p></div>
</a></div>`,
  )
  .join("\n")}
</div>`;
}

function pager(all: Page[], current: Page): string {
  const i = all.findIndex((p) => hrefOf(p) === hrefOf(current));
  const prev = all[i - 1];
  const next = all[i + 1];
  const cell = (p: Page | undefined, kind: "prev" | "next") =>
    p
      ? `<a class="pagination-nav__link pagination-nav__link--${kind}" href="${hrefOf(p)}"><div class="pagination-nav__sublabel">${kind === "prev" ? "Previous" : "Next"}</div><div class="pagination-nav__label">${escapeHtml(p.title)}</div></a>`
      : "<span></span>";
  return `<nav class="pagination-nav" aria-label="Docs pages">${cell(prev, "prev")}${cell(next, "next")}</nav>`;
}

const STYLE = `
:root { --ifm-color-primary: #b7791f; --ifm-color-primary-dark: #a56d1c; --ifm-color-primary-darker: #9c671a; --ifm-color-primary-darkest: #805516;
  --ifm-color-primary-light: #c98522; --ifm-color-primary-lighter: #d18b24; --ifm-color-primary-lightest: #dc9a3a;
  --ifm-font-family-base: system-ui, -apple-system, "Segoe UI", sans-serif; --ifm-navbar-height: 3.75rem; --ifm-background-color: #fffdf7; }
body { background: var(--ifm-background-color); }
.navbar { position: sticky; top: 0; z-index: 10; }
.navbar__logo { width: 1.6rem; height: 1.6rem; margin-right: .5rem; border-radius: 4px; background: #ffd966; box-shadow: 2px 2px 0 #e0b84a; transform: rotate(-4deg); }
.docs-wrapper { display: flex; max-width: 1400px; margin: 0 auto; }
.docs-sidebar { width: 280px; flex-shrink: 0; border-right: 1px solid var(--ifm-toc-border-color); padding: 1rem .5rem; position: sticky; top: var(--ifm-navbar-height); height: calc(100vh - var(--ifm-navbar-height)); overflow-y: auto; }
.docs-main { flex: 1; min-width: 0; padding: 2rem 2rem 4rem; display: flex; gap: 2rem; }
.docs-content { flex: 1; min-width: 0; max-width: 52rem; }
.docs-toc { width: 220px; flex-shrink: 0; position: sticky; top: calc(var(--ifm-navbar-height) + 1.5rem); align-self: flex-start; max-height: calc(100vh - 6rem); overflow-y: auto; }
.table-of-contents { font-size: .85rem; }
.table-of-contents ul { padding-left: .75rem; }
.hash-link { opacity: 0; padding-left: .4rem; text-decoration: none; }
.anchor:hover .hash-link { opacity: 1; }
.markdown img { border-radius: 10px; }
.feature-card { display: block; height: 100%; color: inherit; text-decoration: none; background: #fff6c9; box-shadow: 3px 4px 0 rgba(0,0,0,.08); border-radius: 4px; transition: transform .15s; }
.feature-cards .col:nth-child(3n+2) .feature-card { background: #ffe0ea; }
.feature-cards .col:nth-child(3n+3) .feature-card { background: #dff5e6; }
.feature-card:hover { transform: rotate(-1deg) translateY(-2px); text-decoration: none; color: inherit; }
.menu__group { font-size: .75rem; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--ifm-color-emphasis-600); padding: 1rem .75rem .35rem; }
.feature-media { margin: 0 0 2rem; }
.feature-media img, .feature-media video { width: 100%; border-radius: 10px; box-shadow: 0 6px 24px rgba(0,0,0,.12); background: #fff; }
.feature-card { overflow: hidden; padding: 0; }
.feature-card__img { width: 100%; aspect-ratio: 16 / 9; object-fit: cover; display: block; }
.pagination-nav { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 3rem; }
.pagination-nav__link--next { text-align: right; }
@media (max-width: 996px) {
  .docs-wrapper { flex-direction: column; }
  .docs-sidebar { width: auto; height: auto; position: static; border-right: 0; border-bottom: 1px solid var(--ifm-toc-border-color); }
  .docs-toc { display: none; }
  .docs-main { padding: 1.25rem 1rem 3rem; }
}`;

function layout(title: string, current: string, side: string, content: string, toc: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} · Post-its docs</title>
<link rel="stylesheet" href="/docs/infima.css">
<style>${STYLE}</style>
</head>
<body>
<nav class="navbar shadow--lw" aria-label="Main">
  <div class="navbar__inner">
    <div class="navbar__items">
      <a class="navbar__brand" href="/docs/"><span class="navbar__logo" aria-hidden="true"></span><b class="navbar__title">Post-its docs</b></a>
      <a class="navbar__item navbar__link${current.startsWith("/docs/features/") ? " navbar__link--active" : ""}" href="/docs/features/">Features</a>
      <a class="navbar__item navbar__link${current === "/docs/pipeline/" ? " navbar__link--active" : ""}" href="/docs/pipeline/">Pipeline</a>
    </div>
    <div class="navbar__items navbar__items--right">
      <a class="navbar__item navbar__link" href="/readme/">README</a>
      <a class="navbar__item navbar__link" href="/">Open the app</a>
    </div>
  </div>
</nav>
<div class="docs-wrapper">
  <aside class="docs-sidebar">${side}</aside>
  <main class="docs-main">
    <article class="docs-content markdown">${content}</article>
    ${toc}
  </main>
</div>
</body>
</html>`;
}

const IMAGE_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".gif": "image/gif",
};

async function sendStatic(res: ServerResponse, file: string, type: string): Promise<boolean> {
  try {
    if (!(await stat(file)).isFile()) return false;
    const body = await readFile(file);
    res.writeHead(200, { "content-type": type, "content-length": body.length, "cache-control": "public, max-age=300" });
    res.end(body);
    return true;
  } catch {
    return false;
  }
}

function notFound(res: ServerResponse): void {
  res.writeHead(404, { "content-type": "text/plain" });
  res.end("not found");
}

export async function serveDocs(_req: IncomingMessage, res: ServerResponse, path: string): Promise<void> {
  if (path === "/docs") {
    res.writeHead(301, { location: "/docs/" });
    res.end();
    return;
  }
  if (path === "/docs/infima.css") {
    if (!(await sendStatic(res, join(SITE(), "infima.min.css"), "text/css; charset=utf-8"))) notFound(res);
    return;
  }
  // images: /docs/assets/<file> from docs/readme-assets/, only plain file names
  const asset = path.match(/^\/docs\/assets\/([\w.-]+)$/);
  if (asset) {
    const type = IMAGE_TYPES[extname(asset[1]).toLowerCase()];
    if (!type || asset[1].startsWith(".") || !(await sendStatic(res, join(ASSETS(), asset[1]), type))) notFound(res);
    return;
  }
  // pages: /docs/, /docs/<slug>/, /docs/features/, /docs/features/<slug>/
  const m = path.match(/^\/docs\/(?:(features)\/)?(?:([\w-]+)\/?)?$/);
  if (!m) return notFound(res);
  if (m[2] && !path.endsWith("/")) {
    res.writeHead(301, { location: `${path}/` });
    res.end();
    return;
  }
  const section = (m[1] ?? "") as Page["section"];
  const slug = m[2] ?? "index";
  if (section === "" && slug === "features") {
    res.writeHead(301, { location: "/docs/features/" });
    res.end();
    return;
  }

  const [general, features] = await Promise.all([loadSection(""), loadSection("features")]);
  const pool = section === "features" ? features : general;
  let page = pool.find((p) => p.slug === slug);
  if (!page && section === "features" && slug === "index") {
    page = { slug: "index", section: "features", title: "Features", order: 0, summary: "", image: "", video: "", body: "# Features\n\nEverything you can do on a board. Pick one on the left for how to use it and a demo.\n" };
  }
  if (!page) return notFound(res);

  const current = hrefOf(page);
  const { html, toc } = await render(page.body);
  const extra = section === "features" && slug === "index" ? featureCards(features) : "";
  const tocHtml = toc.length
    ? `<aside class="docs-toc"><div class="table-of-contents__title margin-bottom--sm"><b>On this page</b></div><ul class="table-of-contents table-of-contents__left-border">${toc
        .map((t) => `<li${t.depth === 3 ? ' style="margin-left:.75rem"' : ""}><a class="table-of-contents__link" href="#${t.id}">${t.text}</a></li>`)
        .join("")}</ul></aside>`
    : "";
  // a feature page: the H1, then the demo, then the rest
  const withMedia = media(page) ? html.replace(/(<\/h1>\n?)/, `$1${media(page)}`) : html;
  const body = `${withMedia}${extra}${pager([...features, ...general], page)}`;

  res.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-cache",
    "content-security-policy": "default-src 'none'; img-src 'self' https: data:; media-src 'self'; style-src 'self' 'unsafe-inline'",
  });
  res.end(layout(page.title, current, sidebar(general, features, current), body, tocHtml));
}
