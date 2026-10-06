import type { IncomingMessage, ServerResponse } from "node:http";

/** An error that becomes an HTTP response with a JSON body {error}. */
export class HttpError extends Error {
  status: number;
  extra: Record<string, unknown>;
  constructor(status: number, message: string, extra: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export function sendJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string | string[]> = {}): void {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...headers,
  });
  res.end(data);
}

const MAX_BODY = 16 * 1024;

export async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const type = req.headers["content-type"] ?? "";
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new HttpError(413, "request body too large");
    chunks.push(chunk as Buffer);
  }
  if (size === 0) return {};
  // A JSON content type is required for bodies: an HTML form can't send one
  // cross-site without a CORS preflight, which this server never grants.
  if (!type.startsWith("application/json")) throw new HttpError(415, "expected application/json");
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "invalid JSON");
  }
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    try {
      out[name] = decodeURIComponent(value);
    } catch {
      out[name] = value;
    }
  }
  return out;
}

export function clientIp(req: IncomingMessage): string {
  const fly = req.headers["fly-client-ip"];
  if (typeof fly === "string" && fly) return fly;
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd) return fwd.split(",")[0].trim();
  return req.socket.remoteAddress ?? "unknown";
}

export function isHttps(req: IncomingMessage): boolean {
  return req.headers["x-forwarded-proto"] === "https";
}

/** True when the request's Origin (if any) is this server's own host. */
export function sameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

// Field validators: each returns the clean value or throws a 400.
export function str(body: Record<string, unknown>, key: string, opts: { min?: number; max: number; optional?: boolean }): string | undefined {
  const v = body[key];
  if (v === undefined || v === null || v === "") {
    if (opts.optional) return undefined;
    if ((opts.min ?? 1) > 0) throw new HttpError(400, `${key} is required`);
    return "";
  }
  if (typeof v !== "string") throw new HttpError(400, `${key} must be a string`);
  if (v.length < (opts.min ?? 0)) throw new HttpError(400, `${key} must be at least ${opts.min} characters`);
  if (v.length > opts.max) throw new HttpError(400, `${key} must be at most ${opts.max} characters`);
  return v;
}

export function num(body: Record<string, unknown>, key: string, optional = false): number | undefined {
  const v = body[key];
  if (v === undefined && optional) return undefined;
  if (typeof v !== "number" || !Number.isFinite(v)) throw new HttpError(400, `${key} must be a number`);
  // the canvas is infinite, but not unbounded
  return Math.max(-1e6, Math.min(1e6, v));
}
