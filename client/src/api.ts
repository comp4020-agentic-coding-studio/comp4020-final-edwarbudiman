// Thin wrappers over the server's JSON API and the shapes it returns.

export interface Me {
  id: number;
  username: string;
  anonymous: boolean;
  isDemo: boolean;
  email?: string | null;
}

export type Color = "yellow" | "pink" | "blue" | "green" | "orange" | "purple";
export const COLORS: Color[] = ["yellow", "pink", "blue", "green", "orange", "purple"];
export const LABEL_MAX = 24;
export const LABELS_PER_NOTE = 5;

/** Where a board lives: yours at /, someone else's at /<name>, a channel at /c/<slug>. */
export function boardPath(kind: "user" | "channel", slug: string, me?: string): string {
  if (kind === "channel") return `/c/${encodeURIComponent(slug)}`;
  return me && slug.toLowerCase() === me.toLowerCase() ? "/" : `/${encodeURIComponent(slug)}`;
}

export interface Note {
  id: number;
  boardId: number;
  author: string;
  text: string;
  color: Color;
  x: number;
  y: number;
  z: number;
  visibility: "public" | "private";
  labels: string[];
  version: number;
  createdAt: number;
  updatedAt: number;
  canEdit: boolean;
  canMove: boolean;
}

export interface BoardInfo {
  id: number;
  kind: "user" | "channel";
  slug: string;
  name: string;
  owner: string | null;
  isOwner: boolean;
  visibility: "public" | "key" | "list";
  access?: { allow: string[]; deny: string[] };
}

export interface ChannelSummary {
  slug: string;
  name: string;
  visibility: "public" | "key" | "list";
  owner: string;
  member: boolean;
  members: number;
}

export class ApiError extends Error {
  status: number;
  data: Record<string, unknown>;
  constructor(status: number, message: string, data: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

/** Called on any 401, so the app can drop back to the sign-in page. */
export let onUnauthorized: () => void = () => {};
export function setOnUnauthorized(fn: () => void): void {
  onUnauthorized = fn;
}

export async function api<T = Record<string, unknown>>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? {} : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your connection and try again.", {});
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith("/api/login") && !path.startsWith("/api/me")) onUnauthorized();
    throw new ApiError(res.status, typeof data.error === "string" ? data.error : `request failed (${res.status})`, data);
  }
  return data as T;
}
