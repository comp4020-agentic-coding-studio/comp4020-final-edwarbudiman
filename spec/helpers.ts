import { randomBytes } from "node:crypto";
import { expect, inject } from "vitest";
import WebSocket from "ws";

// Shared by the spec's own checks: accounts, a cookie-carrying client, and a
// WebSocket client. Every response any check receives is also screened here
// for a password or a password hash, so "no response ever contains one" is
// checked on every call, not just in one test.

export const baseUrl = inject("baseUrl");

const secrets = new Set<string>();
const HASH_RE = /scrypt\$\d+\$/;

function screen(where: string, text: string): void {
  expect(HASH_RE.test(text), `${where} contains a password hash`).toBe(false);
  for (const s of secrets) expect(text.includes(s), `${where} contains a password or key`).toBe(false);
}

export interface Client {
  username: string;
  password: string;
  cookie: string;
  call: (method: string, path: string, body?: unknown) => Promise<{ status: number; body: any }>;
}

export const uniqueName = (prefix = "t"): string => `${prefix}${randomBytes(5).toString("hex")}`;

/** Remember a secret so every later response is checked for it. */
export function secret(s: string): string {
  secrets.add(s);
  return s;
}

export async function rawCall(method: string, path: string, body?: unknown, cookie = ""): Promise<{ status: number; body: any; headers: Headers }> {
  const res = await fetch(new URL(path, baseUrl), {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(cookie ? { cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  screen(`${method} ${path}`, text);
  screen(`${method} ${path} headers`, JSON.stringify([...res.headers]));
  let parsed: any = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { status: res.status, body: parsed, headers: res.headers };
}

function clientFor(username: string, password: string, cookie: string): Client {
  return {
    username,
    password,
    cookie,
    call: async (method, path, body) => {
      const r = await rawCall(method, path, body, cookie);
      return { status: r.status, body: r.body };
    },
  };
}

function cookieFrom(headers: Headers): string {
  const set = headers.get("set-cookie") ?? "";
  const m = set.match(/sid=([^;]+)/);
  expect(m, "no session cookie set").not.toBeNull();
  return `sid=${m![1]}`;
}

export async function signup(prefix = "t"): Promise<Client> {
  const username = uniqueName(prefix);
  const password = secret(`pw-${randomBytes(8).toString("hex")}`);
  const r = await rawCall("POST", "/api/signup", { username, password });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return clientFor(username, password, cookieFrom(r.headers));
}

export async function login(username: string, password: string): Promise<Client> {
  const r = await rawCall("POST", "/api/login", { username, password });
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return clientFor(username, password, cookieFrom(r.headers));
}

export async function boardOf(c: Client, username: string): Promise<{ board: any; notes: any[] }> {
  const r = await c.call("GET", `/api/boards/user/${username}`);
  expect(r.status).toBe(200);
  return r.body;
}

// ---------------------------------------------------------------- WebSocket

export interface Live {
  ws: WebSocket;
  messages: any[];
  send: (msg: unknown) => void;
  /** Resolve with the first message (already received or next) matching pred. */
  next: (pred: (m: any) => boolean, timeoutMs?: number) => Promise<any>;
  close: () => Promise<void>;
}

export async function connect(c: Client, boardId: number): Promise<Live> {
  const url = new URL("/ws", baseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(url, { headers: { cookie: c.cookie, origin: new URL(baseUrl).origin } });
  const messages: any[] = [];
  const waiters: { pred: (m: any) => boolean; resolve: (m: any) => void }[] = [];
  ws.on("message", (data) => {
    const text = String(data);
    screen("websocket message", text);
    const m = JSON.parse(text);
    messages.push(m);
    for (const w of [...waiters]) {
      if (w.pred(m)) {
        waiters.splice(waiters.indexOf(w), 1);
        w.resolve(m);
      }
    }
  });
  await new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", reject);
  });
  const live: Live = {
    ws,
    messages,
    send: (msg) => ws.send(JSON.stringify(msg)),
    next: (pred, timeoutMs = 3000) =>
      new Promise((resolve, reject) => {
        const seen = messages.find(pred);
        if (seen) {
          messages.splice(messages.indexOf(seen), 1);
          return resolve(seen);
        }
        const timer = setTimeout(() => reject(new Error("timed out waiting for a message")), timeoutMs);
        waiters.push({
          pred,
          resolve: (m) => {
            clearTimeout(timer);
            messages.splice(messages.indexOf(m), 1);
            resolve(m);
          },
        });
      }),
    close: () =>
      new Promise((resolve) => {
        if (ws.readyState === WebSocket.CLOSED) return resolve();
        ws.once("close", () => resolve());
        ws.close();
      }),
  };
  live.send({ type: "join", board: boardId });
  await live.next((m) => m.type === "joined");
  return live;
}
