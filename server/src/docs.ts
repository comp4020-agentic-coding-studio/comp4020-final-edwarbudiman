import { readdir, readFile, stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { basename, extname, join } from "node:path";
import { Marked } from "marked";
import { config } from "./config.ts";

/**
 * /docs/: what each feature does and how to use it, plus how the app is built
 * (the agent pipeline and its roles). It looks like Docusaurus because it is
 * Infima, Docusaurus's own CSS (vendored in docs/site/), around Markdown
 * rendered on the server: complete HTML, no script, no build step.
 *
 * Content, per version:
 *   docs/site/                       the current version ("next" in the URL is
 *                                    never used; current lives at /docs/...)
 *   docs/site/versions/<v>/          frozen copies, served at /docs/<v>/...
 *   docs/site/versions.json          [{ "id": "v1.0", "label": "1.0 (current)",
 *                                       "date": "...", "note": "..." }, ...]
 *                                    newest first; the first is the current one
 *
 * In each version folder: *.md (general pages), features/*.md, roles/*.md.
 * Each page may start with front matter:
 *
 *   ---
 *   title: Live cursors
 *   order: 3
 *   summary: one line for the index cards
 *   image: feature-cursors.png      (docs/readme-assets/, optional)
 *   video: cursors-demo.mp4         (docs/readme-assets/, optional, wins over image)
 *   avatar: avatars/builder.png     (roles: docs/readme-assets/, optional)
 *   model: Sonnet                   (roles: shown in the profile header)
 *   tagline: Turns a brief into tested code  (roles)
 *   ---
 */

const SITE = () => join(config.rootDir, "docs", "site");
const ASSETS = () => join(config.rootDir, "docs", "readme-assets");

const SECTIONS = ["features", "roles"] as const;
type Section = "" | (typeof SECTIONS)[number];
const SECTION_LABEL: Record<Section, string> = { features: "Features", roles: "Roles", "": "How it's built" };

type Page = {
  slug: string;
  section: Section;
  meta: Record<string, string>;
  title: string;
  order: number;
  body: string;
};

type Version = { id: string; label: string; date?: string; note?: string };

const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const slugify = (s: string): string =>
  s
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

function parsePage(raw: string, slug: string, section: Section): Page {
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
  return { slug, section, meta, title: meta.title ?? h1 ?? slug, order: Number(meta.order ?? 100), body };
}

async function loadVersions(): Promise<Version[]> {
  try {
    const list = JSON.parse(await readFile(join(SITE(), "versions.json"), "utf8")) as Version[];
    if (Array.isArray(list) && list.length) return list;
  } catch {
    // no versions.json: one unnamed version
  }
  return [{ id: "current", label: "current" }];
}

/** Folder holding a version's pages: the current one is docs/site itself. */
const versionDir = (versions: Version[], v: Version): string =>
  v.id === versions[0].id ? SITE() : join(SITE(), "versions", v.id);

async function loadSection(dir: string, section: Section): Promise<Page[]> {
  const full = section ? join(dir, section) : dir;
  let names: string[];
  try {
    names = await readdir(full);
  } catch {
    return [];
  }
  const pages = await Promise.all(
    names
      .filter((n) => n.endsWith(".md") && !n.startsWith("."))
      .map(async (n) => parsePage(await readFile(join(full, n), "utf8"), basename(n, ".md"), section)),
  );
  return pages.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}

/** URL prefix of a version: /docs/ for the current one, /docs/<id>/ for older ones. */
const base = (versions: Version[], v: Version): string => (v.id === versions[0].id ? "/docs/" : `/docs/${v.id}/`);

const hrefIn = (prefix: string, p: { section: Section; slug: string }): string => {
  const sec = p.section ? `${p.section}/` : "";
  return p.slug === "index" ? `${prefix}${sec}` : `${prefix}${sec}${p.slug}/`;
};

/** Markdown to HTML with heading ids, collecting h2/h3 for the table of contents. */
async function render(md: string, prefix: string): Promise<{ html: string; toc: { depth: number; id: string; text: string }[] }> {
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
  // links written as /docs/... in a page stay inside the version being read
  const html = (await marked.parse(md)).replace(/href="\/docs\/(?!assets\/)/g, `href="${prefix}`);
  return { html, toc };
}

const mediaSrc = (file: string) => `/docs/assets/${file.split("/").map(encodeURIComponent).join("/")}`;

function avatar(p: Page, size: "sm" | "lg"): string {
  if (!p.meta.avatar) return `<span class="role-avatar role-avatar--${size} role-avatar--blank" aria-hidden="true"></span>`;
  return `<img class="role-avatar role-avatar--${size}" src="${mediaSrc(p.meta.avatar)}" alt="" loading="lazy">`;
}

function sidebar(groups: [Section, Page[]][], prefix: string, current: string): string {
  const link = (p: Page) => {
    const href = hrefIn(prefix, p);
    const active = href === current ? " menu__link--active" : "";
    const pic = p.section === "roles" ? avatar(p, "sm") : "";
    return `<li class="menu__list-item"><a class="menu__link${active}" href="${href}">${pic}${escapeHtml(p.title)}</a></li>`;
  };
  return `<nav class="menu thin-scrollbar" aria-label="Docs"><ul class="menu__list">
${groups
  .filter(([, pages]) => pages.length)
  .map(
    ([sec, pages]) =>
      `<li class="menu__list-item"><a class="menu__group" href="${prefix}${sec ? `${sec}/` : ""}">${SECTION_LABEL[sec]}</a><ul class="menu__list">${pages
        .filter((p) => p.slug !== "index")
        .map(link)
        .join("")}</ul></li>`,
  )
  .join("\n")}
</ul></nav>`;
}

/** The demo at the top of a feature page: a video if there is one, else the screenshot. */
function featureMedia(p: Page): string {
  const { image, video } = p.meta;
  if (video) {
    const poster = image ? ` poster="${mediaSrc(image)}"` : "";
    return `<figure class="feature-media"><video src="${mediaSrc(video)}"${poster} controls muted loop playsinline preload="metadata"></video></figure>`;
  }
  if (image) return `<figure class="feature-media"><img src="${mediaSrc(image)}" alt="${escapeHtml(p.title)}"></figure>`;
  return "";
}

/** The profile header at the top of a role page: avatar, name, model, tagline. */
function roleHeader(p: Page): string {
  const chips = [p.meta.model && `<span class="badge badge--secondary">${escapeHtml(p.meta.model)}</span>`, p.meta.where && `<span class="badge badge--secondary">${escapeHtml(p.meta.where)}</span>`]
    .filter(Boolean)
    .join(" ");
  return `<header class="role-header">${avatar(p, "lg")}<div><h1 id="${slugify(p.title)}">${escapeHtml(p.title)}</h1>${
    p.meta.tagline ? `<p class="role-tagline">${escapeHtml(p.meta.tagline)}</p>` : ""
  }<div>${chips}</div></div></header>`;
}

function cards(pages: Page[], prefix: string): string {
  const items = pages.filter((p) => p.slug !== "index");
  if (!items.length) return "<p>Nothing documented here yet.</p>";
  return `<div class="row note-cards">
${items
  .map((p) => {
    const top =
      p.section === "roles"
        ? `<div class="note-card__avatar">${avatar(p, "lg")}</div>`
        : p.meta.image
          ? `<img class="note-card__img" src="${mediaSrc(p.meta.image)}" alt="" loading="lazy">`
          : "";
    const sub = p.section === "roles" ? p.meta.tagline : p.meta.summary;
    return `<div class="col col--${p.section === "roles" ? 4 : 6} margin-bottom--lg"><a class="card note-card" href="${hrefIn(prefix, p)}">${top}<div class="padding--lg"><h3>${escapeHtml(p.title)}</h3><p>${escapeHtml(sub ?? "")}</p></div></a></div>`;
  })
  .join("\n")}
</div>`;
}

function pager(all: Page[], prefix: string, current: string): string {
  const i = all.findIndex((p) => hrefIn(prefix, p) === current);
  const cell = (p: Page | undefined, kind: "prev" | "next") =>
    p
      ? `<a class="pagination-nav__link pagination-nav__link--${kind}" href="${hrefIn(prefix, p)}"><div class="pagination-nav__sublabel">${kind === "prev" ? "Previous" : "Next"}</div><div class="pagination-nav__label">${escapeHtml(p.title)}</div></a>`
      : "<span></span>";
  return `<nav class="pagination-nav" aria-label="Docs pages">${cell(all[i - 1], "prev")}${cell(all[i + 1], "next")}</nav>`;
}

/** Docusaurus's version dropdown: a <details> menu, so it works with no script. */
function versionMenu(versions: Version[], v: Version, pathInVersion: string): string {
  return `<details class="navbar__item dropdown dropdown--hoverable dropdown--right version-menu">
  <summary class="navbar__link">${escapeHtml(v.label)}</summary>
  <ul class="dropdown__menu">
${versions
  .map(
    (o) =>
      `<li><a class="dropdown__link${o.id === v.id ? " dropdown__link--active" : ""}" href="${base(versions, o)}${pathInVersion}">${escapeHtml(o.label)}${
        o.date ? `<small>${escapeHtml(o.date)}</small>` : ""
      }</a></li>`,
  )
  .join("\n")}
    <li><hr class="dropdown__divider"></li>
    <li><a class="dropdown__link" href="${base(versions, versions[0])}versions/">All versions</a></li>
  </ul>
</details>`;
}

function banner(versions: Version[], v: Version, pathInVersion: string): string {
  if (v.id === versions[0].id) return "";
  return `<div class="alert alert--warning margin-bottom--md" role="alert">This is the documentation for <b>${escapeHtml(v.label)}</b>${
    v.date ? ` (${escapeHtml(v.date)})` : ""
  }, an earlier version of Post-its. See the <a href="${base(versions, versions[0])}${pathInVersion}">latest version</a>.</div>`;
}

const STYLE = `
:root { --ifm-color-primary: #b7791f; --ifm-color-primary-dark: #a56d1c; --ifm-color-primary-darker: #9c671a; --ifm-color-primary-darkest: #805516;
  --ifm-color-primary-light: #c98522; --ifm-color-primary-lighter: #d18b24; --ifm-color-primary-lightest: #dc9a3a;
  --ifm-font-family-base: system-ui, -apple-system, "Segoe UI", sans-serif; --ifm-navbar-height: 3.75rem; --ifm-background-color: #fffdf7; }
body { background: var(--ifm-background-color); }
.navbar { position: sticky; top: 0; z-index: 10; }
.navbar__logo { width: 1.6rem; height: 1.6rem; margin-right: .5rem; border-radius: 4px; background: #ffd966; box-shadow: 2px 2px 0 #e0b84a; transform: rotate(-4deg); }
.version-menu { position: relative; }
.version-menu > summary { list-style: none; cursor: pointer; pointer-events: auto !important; }
.version-menu > summary::-webkit-details-marker { display: none; }
.version-menu[open] > .dropdown__menu, .version-menu:hover > .dropdown__menu, .version-menu:focus-within > .dropdown__menu { opacity: 1; visibility: visible; pointer-events: all; transform: translateY(-1px); }
.version-menu .dropdown__menu { right: 0; left: auto; min-width: 12rem; }
.version-menu .dropdown__link small { display: block; color: var(--ifm-color-emphasis-600); font-size: .75rem; }
.docs-wrapper { display: flex; max-width: 1400px; margin: 0 auto; }
.docs-sidebar { width: 280px; flex-shrink: 0; border-right: 1px solid var(--ifm-toc-border-color); padding: 1rem .5rem; position: sticky; top: var(--ifm-navbar-height); height: calc(100vh - var(--ifm-navbar-height)); overflow-y: auto; }
.docs-main { flex: 1; min-width: 0; padding: 2rem 2rem 4rem; display: flex; gap: 2rem; }
.docs-content { flex: 1; min-width: 0; max-width: 52rem; }
.docs-toc { width: 220px; flex-shrink: 0; position: sticky; top: calc(var(--ifm-navbar-height) + 1.5rem); align-self: flex-start; max-height: calc(100vh - 6rem); overflow-y: auto; }
.table-of-contents { font-size: .85rem; }
.hash-link { opacity: 0; padding-left: .4rem; text-decoration: none; }
.anchor:hover .hash-link { opacity: 1; }
.markdown img { border-radius: 10px; }
.menu__group { display: block; font-size: .75rem; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--ifm-color-emphasis-600); padding: 1rem .75rem .35rem; text-decoration: none; }
.menu__group:hover { color: var(--ifm-color-primary); text-decoration: none; }
.menu__link { display: flex; align-items: center; gap: .55rem; }
.role-avatar, .markdown img.role-avatar { border-radius: 50%; object-fit: cover; background: #fff6c9; flex-shrink: 0; box-shadow: 0 1px 3px rgba(0,0,0,.15); }
.role-avatar--sm { width: 1.6rem; height: 1.6rem; }
.role-avatar--lg { width: 7rem; height: 7rem; border: 4px solid #fff; box-shadow: 3px 4px 0 rgba(0,0,0,.08); }
.role-avatar--blank { display: inline-block; }
.role-header { display: flex; align-items: center; gap: 1.5rem; margin-bottom: 2rem; padding: 1.5rem; background: #fff6c9; border-radius: 6px; box-shadow: 3px 4px 0 rgba(0,0,0,.06); transform: rotate(-.4deg); }
.role-header h1 { margin: 0 0 .25rem; }
.role-tagline { margin: 0 0 .5rem; font-size: 1.1rem; color: var(--ifm-color-emphasis-700); }
.feature-media { margin: 0 0 2rem; }
.feature-media img, .feature-media video { width: 100%; border-radius: 10px; box-shadow: 0 6px 24px rgba(0,0,0,.12); background: #fff; }
.note-card { display: block; height: 100%; overflow: hidden; padding: 0; color: inherit; text-decoration: none; background: #fff6c9; box-shadow: 3px 4px 0 rgba(0,0,0,.08); border-radius: 4px; transition: transform .15s; }
.note-cards .col:nth-child(3n+2) .note-card { background: #ffe0ea; }
.note-cards .col:nth-child(3n+3) .note-card { background: #dff5e6; }
.note-card:hover { transform: rotate(-1deg) translateY(-2px); text-decoration: none; color: inherit; }
.note-card__img { width: 100%; aspect-ratio: 16 / 9; object-fit: cover; display: block; }
.note-card__avatar { display: flex; justify-content: center; padding-top: 1.5rem; }
.version-table td small { color: var(--ifm-color-emphasis-600); }
.pagination-nav { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 3rem; }
.pagination-nav__link--next { text-align: right; }
@media (max-width: 996px) {
  .docs-wrapper { flex-direction: column; }
  .docs-sidebar { width: auto; height: auto; position: static; border-right: 0; border-bottom: 1px solid var(--ifm-toc-border-color); }
  .docs-toc { display: none; }
  .docs-main { padding: 1.25rem 1rem 3rem; }
  .navbar__items .nav-wide { display: none; }
  .role-header { flex-direction: column; text-align: center; }
}`;

function layout(o: { title: string; prefix: string; current: string; side: string; content: string; toc: string; versions: string }): string {
  const active = (sec: string) => (o.current.startsWith(`${o.prefix}${sec}/`) ? " navbar__link--active" : "");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(o.title)} · Post-its docs</title>
<link rel="stylesheet" href="/docs/infima.css">
<style>${STYLE}</style>
</head>
<body>
<nav class="navbar shadow--lw" aria-label="Main">
  <div class="navbar__inner">
    <div class="navbar__items">
      <a class="navbar__brand" href="${o.prefix}"><span class="navbar__logo" aria-hidden="true"></span><b class="navbar__title">Post-its docs</b></a>
      <a class="navbar__item navbar__link${active("features")}" href="${o.prefix}features/">Features</a>
      <a class="navbar__item navbar__link${active("roles")}" href="${o.prefix}roles/">Roles</a>
      <a class="navbar__item navbar__link nav-wide${o.current === `${o.prefix}pipeline/` ? " navbar__link--active" : ""}" href="${o.prefix}pipeline/">Pipeline</a>
    </div>
    <div class="navbar__items navbar__items--right">
      ${o.versions}
      <a class="navbar__item navbar__link nav-wide" href="/readme/">README</a>
      <a class="navbar__item navbar__link nav-wide" href="/">Open the app</a>
    </div>
  </div>
</nav>
<div class="docs-wrapper">
  <aside class="docs-sidebar">${o.side}</aside>
  <main class="docs-main">
    <article class="docs-content markdown">${o.content}</article>
    ${o.toc}
  </main>
</div>
</body>
</html>`;
}

const ASSET_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
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

function redirect(res: ServerResponse, location: string): void {
  res.writeHead(301, { location });
  res.end();
}

const SECTION_INTRO: Record<string, string> = {
  features: "# Features\n\nEverything you can do on a board. Pick one for what it does, how to use it, and a demo.\n",
  roles: "# Roles\n\nEach feature is built by a small team of agents, each with one job and one instruction file. I'm the owner: I make the product calls and do every merge.\n",
};

export async function serveDocs(_req: IncomingMessage, res: ServerResponse, path: string): Promise<void> {
  if (path === "/docs") return redirect(res, "/docs/");
  if (path === "/docs/infima.css") {
    if (!(await sendStatic(res, join(SITE(), "infima.min.css"), "text/css; charset=utf-8"))) notFound(res);
    return;
  }
  // images and videos from docs/readme-assets/: plain names, one optional sub-folder
  const asset = path.match(/^\/docs\/assets\/((?:[\w-]+\/)?[\w-][\w.-]*)$/);
  if (asset) {
    const type = ASSET_TYPES[extname(asset[1]).toLowerCase()];
    if (!type || !(await sendStatic(res, join(ASSETS(), asset[1]), type))) notFound(res);
    return;
  }

  const versions = await loadVersions();
  let rest = path.slice("/docs/".length);
  let version = versions[0];
  const first = rest.split("/")[0];
  const older = versions.slice(1).find((v) => v.id === first);
  if (older) {
    version = older;
    rest = rest.slice(first.length + 1);
  }
  if (rest && !rest.endsWith("/")) return redirect(res, `${path}/`);
  const parts = rest.split("/").filter(Boolean);
  if (parts.length > 2 || parts.some((p) => !/^[\w-]+$/.test(p))) return notFound(res);

  const prefix = base(versions, version);
  const dir = versionDir(versions, version);
  const [general, ...sectioned] = await Promise.all([loadSection(dir, ""), ...SECTIONS.map((s) => loadSection(dir, s))]);
  const bySection = new Map<Section, Page[]>([["", general], ...SECTIONS.map((s, i) => [s, sectioned[i]] as [Section, Page[]])]);
  const groups: [Section, Page[]][] = [
    ["features", bySection.get("features") ?? []],
    ["roles", bySection.get("roles") ?? []],
    ["", general],
  ];

  let page: Page | undefined;
  let extra = "";
  const isSection = (s: string): s is (typeof SECTIONS)[number] => (SECTIONS as readonly string[]).includes(s);
  if (parts.length === 0) {
    page = general.find((p) => p.slug === "index");
  } else if (parts.length === 1 && parts[0] === "versions") {
    page = { slug: "versions", section: "", meta: {}, title: "Versions", order: 999, body: "# Versions\n\nEach version is a snapshot of these docs at a milestone. The newest is the app as it runs today.\n" };
    extra = `<table class="version-table"><thead><tr><th>Version</th><th>Date</th><th>What changed</th></tr></thead><tbody>${versions
      .map((v) => `<tr><td><a href="${base(versions, v)}">${escapeHtml(v.label)}</a></td><td>${escapeHtml(v.date ?? "")}</td><td>${escapeHtml(v.note ?? "")}</td></tr>`)
      .join("")}</tbody></table>`;
  } else if (isSection(parts[0])) {
    const pool = bySection.get(parts[0]) ?? [];
    const slug = parts[1] ?? "index";
    page = pool.find((p) => p.slug === slug);
    if (!page && slug === "index") {
      if (!pool.length) return notFound(res);
      page = { slug: "index", section: parts[0], meta: {}, title: SECTION_LABEL[parts[0]], order: 0, body: SECTION_INTRO[parts[0]] };
    }
    if (page && slug === "index") extra = cards(pool, prefix);
  } else if (parts.length === 1) {
    page = general.find((p) => p.slug === parts[0] && p.slug !== "index");
  }
  if (!page) return notFound(res);

  const current = page.slug === "versions" ? `${prefix}versions/` : hrefIn(prefix, page);
  const pathInVersion = current.slice(prefix.length);
  let { html, toc } = await render(page.body, prefix);
  if (page.section === "roles" && page.slug !== "index") {
    html = html.replace(/<h1[^>]*>[\s\S]*?<\/h1>\n?/, roleHeader(page));
  } else if (page.section === "features") {
    const media = featureMedia(page);
    if (media) html = html.replace(/(<\/h1>\n?)/, `$1${media}`);
  }
  const ordered = groups.flatMap(([, pages]) => pages);
  const content = `${banner(versions, version, pathInVersion)}${html}${extra}${page.slug === "versions" ? "" : pager(ordered, prefix, current)}`;
  const tocHtml = toc.length
    ? `<aside class="docs-toc"><div class="margin-bottom--sm"><b>On this page</b></div><ul class="table-of-contents table-of-contents__left-border">${toc
        .map((t) => `<li${t.depth === 3 ? ' style="margin-left:.75rem"' : ""}><a class="table-of-contents__link" href="#${t.id}">${t.text}</a></li>`)
        .join("")}</ul></aside>`
    : "";

  res.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-cache",
    "content-security-policy": "default-src 'none'; img-src 'self' https: data:; media-src 'self'; style-src 'self' 'unsafe-inline'",
  });
  res.end(
    layout({
      title: page.title,
      prefix,
      current,
      side: sidebar(groups, prefix, current),
      content,
      toc: tocHtml,
      versions: versions.length > 1 ? versionMenu(versions, version, pathInVersion) : "",
    }),
  );
}
