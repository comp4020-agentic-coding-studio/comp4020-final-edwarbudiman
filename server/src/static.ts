import { readFile, stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, join, normalize, sep } from "node:path";
import { marked } from "marked";
import { config } from "./config.ts";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"]);

/** Resolve a URL path under root, refusing anything that escapes it or names a dotfile. */
function safePath(root: string, urlPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;
  const full = normalize(join(root, decoded));
  if (full !== root && !full.startsWith(root + sep)) return null;
  if (full.slice(root.length).split(sep).some((part) => part.startsWith("."))) return null;
  return full;
}

async function sendFile(res: ServerResponse, file: string, cache: string): Promise<boolean> {
  try {
    const s = await stat(file);
    if (!s.isFile()) return false;
    const body = await readFile(file);
    res.writeHead(200, {
      "content-type": TYPES[extname(file).toLowerCase()] ?? "application/octet-stream",
      "content-length": body.length,
      "cache-control": cache,
    });
    res.end(body);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- /readme/

const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * README.md rendered to HTML on the server, so the page is complete with no
 * script running. Relative image links resolve because the page lives at
 * /readme/ and the files it names are served from the repo root beneath it.
 */
export async function serveReadme(req: IncomingMessage, res: ServerResponse, path: string): Promise<void> {
  if (path === "/readme") {
    res.writeHead(301, { location: "/readme/" });
    res.end();
    return;
  }
  if (path !== "/readme/" && path !== "/readme/index.html") {
    // an image the README links to, e.g. /readme/docs/before.png
    const rel = path.slice("/readme/".length);
    const file = safePath(config.rootDir, rel);
    if (file && IMAGE_EXTS.has(extname(file).toLowerCase()) && (await sendFile(res, file, "public, max-age=300"))) return;
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
    return;
  }
  const md = await readFile(join(config.rootDir, "README.md"), "utf8");
  const body = await marked.parse(md, { gfm: true });
  const title = md.match(/^#\s+(.*)$/m)?.[1] ?? "README";
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  body { font: 16px/1.6 system-ui, sans-serif; max-width: 46rem; margin: 2rem auto; padding: 0 1rem; color: #222; }
  img { max-width: 100%; height: auto; }
  pre { background: #f5f3ee; padding: .75rem; overflow-x: auto; border-radius: 6px; }
  code { font-size: .92em; }
  table { border-collapse: collapse; } td, th { border: 1px solid #ccc; padding: .25rem .5rem; }
  a { color: #8a5a00; }
</style>
</head>
<body>
<main>
${body}
</main>
</body>
</html>`;
  res.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-cache",
    "content-security-policy": "default-src 'none'; img-src 'self' https: data:; style-src 'unsafe-inline'",
  });
  res.end(html);
}

// ---------------------------------------------------------------- the client

/** Built client assets, with the SPA shell for any other page. */
export async function serveClient(req: IncomingMessage, res: ServerResponse, path: string): Promise<void> {
  if (path !== "/" && extname(path)) {
    const file = safePath(config.clientDir, path);
    const immutable = path.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "public, max-age=300";
    if (file && (await sendFile(res, file, immutable))) return;
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
    return;
  }
  const index = join(config.clientDir, "index.html");
  const host = req.headers.host ?? "";
  const csp = [
    "default-src 'self'",
    `connect-src 'self' ws://${host} wss://${host}`,
    "img-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "frame-ancestors 'none'",
  ].join("; ");
  try {
    const html = await readFile(index);
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache", "content-security-policy": csp });
    res.end(html);
  } catch {
    // client not built: still answer, so / is 200 and the spec can run
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end("<!doctype html><title>Post-its</title><p>The client hasn't been built yet: run <code>pnpm build</code>.</p>");
  }
}
