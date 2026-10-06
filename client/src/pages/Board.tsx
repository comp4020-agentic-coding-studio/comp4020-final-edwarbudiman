import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, FormEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { api, ApiError, boardPath, COLORS, LABEL_MAX, LABELS_PER_NOTE } from "../api.ts";
import type { BoardInfo, Color, Note } from "../api.ts";
import { LiveSocket } from "../socket.ts";
import type { ServerMsg, Status } from "../socket.ts";
import { Link, useSession } from "../router.tsx";
import { Header } from "./Header.tsx";
import { Chat } from "./Chat.tsx";

export const NOTE_W = 200;
export const NOTE_H = 160;
const NOTE_MAX = 280;
const MIN_SCALE = 0.2;
const MAX_SCALE = 3;
const CURSOR_EVERY_MS = 50; // ≤ 20 cursor messages a second
const MOVE_EVERY_MS = 50;
const LONG_PRESS_MS = 350;
const PASTE_STEP = 20; // pasting again at the same spot cascades by this much
const CLIP_MIME = "application/x-postits+json";

interface View {
  ox: number; // screen x of world 0
  oy: number;
  s: number; // scale
}
interface Cursor {
  name: string | null;
  x: number;
  y: number;
  t: number;
}
interface LockInfo {
  holder: string;
  mine: boolean;
}
interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
/** A copied note, positioned relative to the top-left of what was copied. */
interface ClipItem {
  text: string;
  color: Color;
  visibility: Note["visibility"];
  labels?: string[];
  dx: number;
  dy: number;
}
interface Clip {
  text: string; // what went on the system clipboard as plain text
  items: ClipItem[];
  x: number; // where the copied group's top-left was
  y: number;
}
type Tool = "select" | "hand";
interface Peer {
  sid: string;
  name: string | null; // null: anonymous
}
type NewNote = { text: string; color: Color; visibility: Note["visibility"]; labels: string[]; x: number; y: number };

type Gesture =
  | { mode: "none" }
  | { mode: "pan"; pointerId: number; sx: number; sy: number; ox: number; oy: number; moved: boolean; fromNote?: boolean }
  | { mode: "pinch"; ids: [number, number]; dist: number; mid: { x: number; y: number }; view: View }
  | { mode: "marquee"; pointerId: number; x0: number; y0: number; base: number[] }
  | { mode: "pending"; pointerId: number; noteId: number; sx: number; sy: number; touch: boolean; timer: number | null; pan: { ox: number; oy: number }; collapse: boolean }
  | { mode: "drag"; pointerId: number; ids: number[]; sx: number; sy: number; origs: Record<number, { x: number; y: number }>; moved: boolean; lastSent: number };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const norm = (r: Rect) => ({ x0: Math.min(r.x0, r.x1), y0: Math.min(r.y0, r.y1), x1: Math.max(r.x0, r.x1), y1: Math.max(r.y0, r.y1) });

const COLOR_NAMES: Record<Color, string> = {
  yellow: "Yellow",
  pink: "Pink",
  blue: "Blue",
  green: "Green",
  orange: "Orange",
  purple: "Purple",
};

// each person in a room gets a colour of their own, from their connection id
const PEER_COLORS = ["#e5484d", "#f76b15", "#30a46c", "#0090ff", "#8e4ec6", "#d6409f", "#12a594", "#ab6400"];
function peerColor(sid: string): string {
  let h = 0;
  for (const ch of sid) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PEER_COLORS[h % PEER_COLORS.length];
}

function readFilter(key: string): Set<string> {
  try {
    const v = JSON.parse(sessionStorage.getItem(key) ?? "[]") as unknown;
    return new Set(Array.isArray(v) ? v.filter((l): l is string => typeof l === "string") : []);
  } catch {
    return new Set();
  }
}

/** Typing somewhere the board's shortcuts shouldn't fire. */
function isTyping(t: EventTarget | null): boolean {
  return t instanceof HTMLElement && !!t.closest("input, textarea, select, [contenteditable='true'], [role='dialog'], .menu-pop");
}

export function BoardPage({ kind, slug }: { kind: "user" | "channel"; slug: string }) {
  const { me } = useSession();
  const [board, setBoard] = useState<BoardInfo | null>(null);
  const [notes, setNotes] = useState<Record<number, Note>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [gate, setGate] = useState<{ visibility: string; message: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("connecting");
  const [presence, setPresence] = useState<{ users: string[]; anon: number }>({ users: [], anon: 0 });
  const [cursors, setCursors] = useState<Record<string, Cursor>>({});
  const [locks, setLocks] = useState<Record<number, LockInfo>>({});
  const [view, setViewState] = useState<View>({ ox: 0, oy: 0, s: 1 });
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [editing, setEditing] = useState<number | null>(null);
  const [newColor, setNewColor] = useState<Color>("yellow");
  const [tool, setTool] = useState<Tool>("select");
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const filterKey = `filter:${kind}/${slug}`;
  const [filter, setFilter] = useState<Set<string>>(() => readFilter(filterKey)); // lower-cased labels; empty = show all
  const [filterOpen, setFilterOpen] = useState(false);
  const [labelOpen, setLabelOpen] = useState(false);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [mySid, setMySid] = useState<string | null>(null);
  const [following, setFollowing] = useState<string | null>(null); // a peer's sid
  const [chatOpen, setChatOpen] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);

  const viewportRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef(view);
  const notesRef = useRef(notes);
  const selectedRef = useRef(selected);
  const editingRef = useRef(editing);
  const locksRef = useRef(locks);
  const toolRef = useRef(tool);
  const spaceRef = useRef(false);
  const sockRef = useRef<LiveSocket | null>(null);
  const gestureRef = useRef<Gesture>({ mode: "none" });
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const lastPointer = useRef<{ x: number; y: number } | null>(null); // where a paste lands
  const lastCursorRef = useRef(0);
  const joinedOnce = useRef(false);
  const chatHandler = useRef<((m: ServerMsg) => void) | null>(null);
  const keyMove = useRef<{ ids: number[]; timer: number } | null>(null);
  const justCreated = useRef<number | null>(null);
  const placed = useRef(false); // the first view is set from the notes (or a saved one)
  const clipRef = useRef<Clip | null>(null);
  const pasteSpot = useRef<{ key: string; n: number } | null>(null);
  const pasteTimer = useRef<number | null>(null);
  const pointerFocus = useRef(false); // a click's focus mustn't reset the selection
  const filterRef = useRef(filter);
  const followingRef = useRef(following);
  const followTarget = useRef<{ x: number; y: number } | null>(null); // the followed cursor, in world coordinates
  // a new note is editable at once, under a temporary negative id, until the server answers
  const tempSeq = useRef(0);
  const tempKeys = useRef(new Map<number, number>()); // real id → the temporary id it was first rendered under
  const pendingText = useRef(new Map<number, string>()); // temporary id → text finished before the server answered
  notesRef.current = notes;
  selectedRef.current = selected;
  editingRef.current = editing;
  locksRef.current = locks;
  toolRef.current = tool;
  filterRef.current = filter;
  followingRef.current = following;

  /** Hidden by the label filter? Filtered-out notes can't be selected or edited. */
  const shown = (n: Note) => filterRef.current.size === 0 || n.labels.some((l) => filterRef.current.has(l.toLowerCase()));
  /** The filter's labels as they're written on the notes, for stamping on new ones. */
  const filterLabels = (): string[] => {
    const out = new Map<string, string>();
    for (const n of Object.values(notesRef.current)) for (const l of n.labels) if (filterRef.current.has(l.toLowerCase()) && !out.has(l.toLowerCase())) out.set(l.toLowerCase(), l);
    return [...out.values()].slice(0, LABELS_PER_NOTE);
  };

  const setView = useCallback((v: View | ((prev: View) => View)) => {
    setViewState((prev) => {
      const next = typeof v === "function" ? v(prev) : v;
      viewRef.current = next;
      return next;
    });
  }, []);

  const select = useCallback((ids: Iterable<number>) => {
    const next = new Set(ids);
    selectedRef.current = next;
    setSelected(next);
  }, []);

  const unselect = useCallback((id: number) => {
    setSelected((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      selectedRef.current = next;
      return next;
    });
  }, []);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 3500);
  }, []);

  const viewKey = `view:${kind}/${slug}`;
  const dragIds = (): number[] => (gestureRef.current.mode === "drag" ? gestureRef.current.ids : []);

  // ---------------------------------------------------------------- loading

  const load = useCallback(
    async (initial: boolean) => {
      try {
        const r = await api<{ board: BoardInfo; notes: Note[] }>("GET", `/api/boards/${kind}/${encodeURIComponent(slug)}`);
        setBoard(r.board);
        setGate(null);
        const map: Record<number, Note> = {};
        for (const n of r.notes) map[n.id] = n;
        // notes I'm dragging keep the position under my pointer
        for (const id of dragIds()) {
          if (map[id] && notesRef.current[id]) map[id] = { ...map[id], x: notesRef.current[id].x, y: notesRef.current[id].y };
        }
        setNotes(map);
        if (initial) placeInitialView(r.notes);
      } catch (err) {
        if (err instanceof ApiError && err.status === 403) {
          setGate({ visibility: String(err.data.visibility ?? "key"), message: err.message });
        } else if (err instanceof ApiError && err.status === 404) {
          setLoadError(kind === "user" ? `There's no user called “${slug}”.` : `There's no channel called #${slug}.`);
        } else if (initial) {
          setLoadError(err instanceof Error ? err.message : "couldn't load the board");
        } else {
          flash("Couldn't resync the board; retrying when the connection is back.");
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kind, slug],
  );

  function placeInitialView(list: Note[]) {
    placed.current = true;
    const el = viewportRef.current;
    const w = el?.clientWidth ?? window.innerWidth;
    const h = el?.clientHeight ?? window.innerHeight;
    const saved = sessionStorage.getItem(viewKey);
    if (saved) {
      try {
        const v = JSON.parse(saved) as View;
        if (Number.isFinite(v.ox) && Number.isFinite(v.oy) && Number.isFinite(v.s)) return setView(v);
      } catch {
        /* fall through */
      }
    }
    if (list.length === 0) return setView({ ox: w / 2 - NOTE_W / 2, oy: h / 2 - NOTE_H / 2, s: 1 });
    fitTo(list, w, h);
  }

  function fitTo(list: Note[], w: number, h: number) {
    if (list.length === 0) return setView({ ox: w / 2 - NOTE_W / 2, oy: h / 2 - NOTE_H / 2, s: 1 });
    const minX = Math.min(...list.map((n) => n.x)) - 40;
    const minY = Math.min(...list.map((n) => n.y)) - 40;
    const maxX = Math.max(...list.map((n) => n.x + NOTE_W)) + 40;
    const maxY = Math.max(...list.map((n) => n.y + NOTE_H)) + 40;
    const s = clamp(Math.min(w / (maxX - minX), h / (maxY - minY), 1), MIN_SCALE, MAX_SCALE);
    setView({ s, ox: w / 2 - ((minX + maxX) / 2) * s, oy: h / 2 - ((minY + maxY) / 2) * s });
  }

  function fitAll() {
    const el = viewportRef.current;
    if (el) fitTo(Object.values(notesRef.current), el.clientWidth, el.clientHeight);
  }

  useEffect(() => {
    void load(true);
  }, [load]);

  useEffect(() => {
    if (placed.current) sessionStorage.setItem(viewKey, JSON.stringify(view));
  }, [view, viewKey]);

  useEffect(() => {
    if (selected.size === 0) setLabelOpen(false);
  }, [selected]);

  useEffect(() => {
    sessionStorage.setItem(filterKey, JSON.stringify([...filter]));
    // whatever the filter now hides drops out of the selection
    const sel = [...selectedRef.current].filter((id) => notesRef.current[id] && shown(notesRef.current[id]));
    if (sel.length !== selectedRef.current.size) select(sel);
  }, [filter, filterKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------- following someone's cursor

  // ease the view towards the followed cursor each frame, keeping it in the middle
  useEffect(() => {
    if (!following) return;
    let raf = 0;
    const tick = () => {
      const t = followTarget.current;
      const el = viewportRef.current;
      if (t && el) {
        setView((v) => {
          const dx = el.clientWidth / 2 - t.x * v.s - v.ox;
          const dy = el.clientHeight / 2 - t.y * v.s - v.oy;
          if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return v;
          return { ...v, ox: v.ox + dx * 0.18, oy: v.oy + dy * 0.18 };
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [following, setView]);

  function follow(sid: string | null) {
    if (sid && sid === followingRef.current) sid = null; // clicking them again stops
    const c = sid ? cursors[sid] : undefined;
    followTarget.current = c ? { x: c.x, y: c.y } : null;
    followingRef.current = sid;
    setFollowing(sid);
  }
  const stopFollowing = () => {
    if (followingRef.current) follow(null);
  };

  // ---------------------------------------------------------------- live updates

  const onMessage = useRef<(m: ServerMsg) => void>(() => {});
  onMessage.current = (m: ServerMsg) => {
    switch (m.type) {
      case "joined":
        // after a reconnect, whatever happened meanwhile is fetched afresh
        if (joinedOnce.current) void load(false);
        joinedOnce.current = true;
        if (typeof m.sid === "string") setMySid(m.sid);
        setCursors({});
        return;
      case "presence": {
        setPresence({ users: m.users as string[], anon: m.anon as number });
        const list = Array.isArray(m.peers) ? (m.peers as Peer[]) : [];
        setPeers(list);
        if (followingRef.current && !list.some((p) => p.sid === followingRef.current)) {
          follow(null);
          flash("They've left the board, so you've stopped following.");
        }
        return;
      }
      case "cursor": {
        const c = { name: m.name as string | null, x: m.x as number, y: m.y as number, t: Date.now() };
        if (m.sid === followingRef.current) followTarget.current = { x: c.x, y: c.y };
        setCursors((prev) => ({ ...prev, [m.sid as string]: c }));
        return;
      }
      case "cursor:leave":
        setCursors((prev) => {
          const next = { ...prev };
          delete next[m.sid as string];
          return next;
        });
        return;
      case "note:upsert": {
        const note = m.note as Note;
        const mine = dragIds().includes(note.id);
        setNotes((prev) => ({ ...prev, [note.id]: mine && prev[note.id] ? { ...note, x: prev[note.id].x, y: prev[note.id].y } : note }));
        return;
      }
      case "note:delete": {
        const id = m.id as number;
        setNotes((prev) => {
          if (!prev[id]) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
        const g = gestureRef.current;
        if (g.mode === "drag") g.ids = g.ids.filter((i) => i !== id);
        setEditing((e) => {
          if (e === id) flash("That note was deleted by someone else.");
          return e === id ? null : e;
        });
        unselect(id);
        return;
      }
      case "note:move": {
        const id = m.id as number;
        if (dragIds().includes(id)) return;
        setNotes((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], x: m.x as number, y: m.y as number } } : prev));
        return;
      }
      case "lock": {
        const id = m.id as number;
        const holder = m.holder as string | null;
        setLocks((prev) => {
          const next = { ...prev };
          if (holder === null) delete next[id];
          else next[id] = { holder, mine: m.mine === true };
          return next;
        });
        return;
      }
      case "lock:denied": {
        const id = m.id as number;
        const g = gestureRef.current;
        if (g.mode === "drag" && g.ids.includes(id)) {
          const orig = g.origs[id];
          setNotes((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], ...orig } } : prev));
          g.ids = g.ids.filter((i) => i !== id);
        }
        if (keyMove.current?.ids.includes(id)) {
          keyMove.current.ids = keyMove.current.ids.filter((i) => i !== id);
          void load(false);
        }
        flash(`${(m.holder as string | null) ?? "Someone"} is moving that note right now.`);
        return;
      }
      case "error":
        if (typeof m.message === "string") flash(m.message);
        return;
      default:
        if (typeof m.type === "string" && m.type.startsWith("chat:")) chatHandler.current?.(m);
    }
  };

  useEffect(() => {
    if (!board) return;
    const sock = new LiveSocket(board.id, (m) => onMessage.current(m), setStatus);
    sockRef.current = sock;
    return () => {
      sock.close();
      sockRef.current = null;
      joinedOnce.current = false;
    };
  }, [board?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // forget cursors that have gone quiet
  useEffect(() => {
    const t = window.setInterval(() => {
      const cutoff = Date.now() - 30_000;
      setCursors((prev) => {
        const stale = Object.entries(prev).filter(([, c]) => c.t < cutoff);
        if (stale.length === 0) return prev;
        const next = { ...prev };
        for (const [sid] of stale) delete next[sid];
        return next;
      });
    }, 5000);
    return () => window.clearInterval(t);
  }, []);

  // ---------------------------------------------------------------- geometry

  const toWorld = (clientX: number, clientY: number) => {
    const rect = viewportRef.current!.getBoundingClientRect();
    const v = viewRef.current;
    return { x: (clientX - rect.left - v.ox) / v.s, y: (clientY - rect.top - v.oy) / v.s };
  };

  const zoomAt = useCallback(
    (factor: number, cx?: number, cy?: number) => {
      const el = viewportRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const px = cx === undefined ? rect.width / 2 : cx - rect.left;
      const py = cy === undefined ? rect.height / 2 : cy - rect.top;
      setView((v) => {
        const s = clamp(v.s * factor, MIN_SCALE, MAX_SCALE);
        const wx = (px - v.ox) / v.s;
        const wy = (py - v.oy) / v.s;
        return { s, ox: px - wx * s, oy: py - wy * s };
      });
    },
    [setView],
  );

  // wheel: scroll pans, pinch (ctrl+wheel on trackpads) or ctrl/cmd+wheel zooms
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest(".chat, textarea")) return;
      e.preventDefault();
      if (followingRef.current) setFollowing((followingRef.current = null));
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientHeight : 1;
      if (e.ctrlKey || e.metaKey) {
        // a mouse wheel notch is a big delta, a pinch a stream of small ones
        zoomAt(Math.exp(-clamp(e.deltaY * unit, -60, 60) * 0.01), e.clientX, e.clientY);
      } else {
        setView((v) => ({ ...v, ox: v.ox - e.deltaX * unit, oy: v.oy - e.deltaY * unit }));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt, setView, board?.id]);

  // resizing the window (or rotating a phone) keeps the same spot in the middle
  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    let last = { w: el.clientWidth, h: el.clientHeight };
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      const dw = w - last.w;
      const dh = h - last.h;
      last = { w, h };
      if (dw || dh) setView((v) => ({ ...v, ox: v.ox + dw / 2, oy: v.oy + dh / 2 }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [setView, board?.id]);

  // ---------------------------------------------------------------- note writes

  const patchNote = useCallback(
    async (id: number, change: Partial<Pick<Note, "text" | "color" | "visibility" | "labels" | "x" | "y">> & { front?: boolean }) => {
      const before = notesRef.current[id];
      if (!before) return;
      const { front: _front, ...local } = change;
      setNotes((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], ...local } } : prev));
      try {
        const r = await api<{ note: Note }>("PATCH", `/api/notes/${id}`, change);
        setNotes((prev) => ({ ...prev, [id]: r.note }));
      } catch (err) {
        setNotes((prev) => (prev[id] ? { ...prev, [id]: before } : prev));
        flash(err instanceof ApiError ? err.message : "couldn't save that");
      }
    },
    [flash],
  );

  async function createNoteAt(x: number, y: number) {
    if (!board) return;
    const tempId = -++tempSeq.current;
    const now = Date.now();
    const temp: Note = {
      id: tempId,
      boardId: board.id,
      author: me.username,
      text: "",
      color: newColor,
      x: Math.round(x),
      y: Math.round(y),
      z: 999_999,
      visibility: "public",
      labels: filterLabels(), // a note made while filtering stays in view
      version: 0,
      createdAt: now,
      updatedAt: now,
      canEdit: true,
      canMove: false, // not until the server knows it
    };
    setNotes((prev) => ({ ...prev, [tempId]: temp }));
    select([tempId]);
    setEditing(tempId);
    justCreated.current = tempId;
    const dropTemp = () => {
      setNotes((prev) => {
        const next = { ...prev };
        delete next[tempId];
        return next;
      });
      unselect(tempId);
    };
    let real: Note;
    try {
      real = (await api<{ note: Note }>("POST", `/api/boards/${board.id}/notes`, { text: "", color: temp.color, x: temp.x, y: temp.y, visibility: "public", labels: temp.labels })).note;
    } catch (err) {
      dropTemp();
      setEditing((e) => (e === tempId ? null : e));
      pendingText.current.delete(tempId);
      return flash(err instanceof ApiError ? err.message : "couldn't add a note");
    }
    const pending = pendingText.current.get(tempId);
    pendingText.current.delete(tempId);
    if (pending !== undefined && !pending.trim()) {
      // left empty (or deleted) before the server answered
      dropTemp();
      return void api("DELETE", `/api/notes/${real.id}`).catch(() => {});
    }
    tempKeys.current.set(real.id, tempId); // same React key, so a half-typed draft survives the swap
    notesRef.current = { ...notesRef.current, [real.id]: real };
    delete notesRef.current[tempId];
    setNotes((prev) => {
      const next = { ...prev, [real.id]: real };
      delete next[tempId];
      return next;
    });
    setSelected((prev) => {
      if (!prev.has(tempId)) return prev;
      const next = new Set(prev);
      next.delete(tempId);
      next.add(real.id);
      selectedRef.current = next;
      return next;
    });
    if (justCreated.current === tempId) justCreated.current = real.id;
    setEditing((e) => (e === tempId ? real.id : e));
    if (pending !== undefined) void patchNote(real.id, { text: pending });
  }

  /** Several notes at once (paste, duplicate); they end up selected. */
  async function createMany(items: NewNote[]) {
    if (!board || items.length === 0) return;
    const results = await Promise.allSettled(
      items.map((it) =>
        api<{ note: Note }>("POST", `/api/boards/${board.id}/notes`, {
          text: it.text.slice(0, NOTE_MAX),
          color: it.color,
          visibility: board.kind === "user" ? it.visibility : "public",
          labels: it.labels,
          x: Math.round(it.x),
          y: Math.round(it.y),
        }),
      ),
    );
    const made = results.flatMap((r) => (r.status === "fulfilled" ? [r.value.note] : []));
    setNotes((prev) => {
      const next = { ...prev };
      for (const n of made) next[n.id] = n;
      return next;
    });
    select(made.map((n) => n.id));
    const failed = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
    if (failed) flash(failed.reason instanceof ApiError ? failed.reason.message : "couldn't add every note");
  }

  function viewportCentre() {
    const el = viewportRef.current!;
    const v = viewRef.current;
    return { x: (el.clientWidth / 2 - v.ox) / v.s, y: (el.clientHeight / 2 - v.oy) / v.s };
  }

  function createAtCentre() {
    if (!viewportRef.current) return;
    const c = viewportCentre();
    // nudge so repeated adds don't stack exactly
    const jitter = () => (Math.random() - 0.5) * 40;
    void createNoteAt(c.x - NOTE_W / 2 + jitter(), c.y - NOTE_H / 2 + jitter());
  }

  async function deleteNote(id: number) {
    const before = notesRef.current[id];
    if (!before) return;
    if (id < 0) pendingText.current.set(id, ""); // deleted for real once the server has it
    setNotes((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    unselect(id);
    setEditing((e) => (e === id ? null : e));
    if (id < 0) return;
    try {
      await api("DELETE", `/api/notes/${id}`);
    } catch (err) {
      setNotes((prev) => ({ ...prev, [id]: before }));
      flash(err instanceof ApiError ? err.message : "couldn't delete that");
    }
  }

  function deleteSelection() {
    const ids = [...selectedRef.current].filter((id) => notesRef.current[id]?.canMove);
    if (ids.length < selectedRef.current.size) flash("You can only delete your own notes here.");
    for (const id of ids) void deleteNote(id);
  }

  async function finishEdit(id: number, text: string | null) {
    setEditing(null);
    const note = notesRef.current[id];
    const fresh = justCreated.current === id;
    justCreated.current = null;
    if (!note) return;
    if (id < 0) {
      // the server hasn't answered yet; createNoteAt saves (or drops) it when it does
      pendingText.current.set(id, text ?? "");
      if (!(text ?? "").trim()) return deleteNote(id);
      setNotes((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], text: text ?? "" } } : prev));
      return;
    }
    // a brand-new note abandoned empty is just removed
    if (fresh && (text === null || text.trim() === "") && note.text === "") return deleteNote(id);
    if (text !== null && text !== note.text) await patchNote(id, { text });
    pointerFocus.current = true; // focusing it again keeps the selection as it is
    viewportRef.current?.querySelector<HTMLElement>(`[data-note="${id}"]`)?.focus();
    pointerFocus.current = false;
  }

  /** Add a label to every selected note you may edit, or take it off them all. */
  function applyLabel(label: string, add: boolean) {
    const clean = label.trim().replace(/\s+/g, " ").slice(0, LABEL_MAX);
    if (!clean) return;
    const key = clean.toLowerCase();
    let full = 0;
    for (const id of selectedRef.current) {
      const n = notesRef.current[id];
      if (!n?.canEdit || id < 0) continue;
      const has = n.labels.some((l) => l.toLowerCase() === key);
      if (add && !has) {
        if (n.labels.length >= LABELS_PER_NOTE) full++;
        else void patchNote(id, { labels: [...n.labels, clean] });
      } else if (!add && has) void patchNote(id, { labels: n.labels.filter((l) => l.toLowerCase() !== key) });
    }
    if (full) flash(`A note can have at most ${LABELS_PER_NOTE} labels, and ${full === 1 ? "one of these is" : `${full} of these are`} full.`);
  }

  function recolourSelection(c: Color) {
    setNewColor(c);
    for (const id of selectedRef.current) {
      const n = notesRef.current[id];
      if (n?.canEdit && n.color !== c) void patchNote(id, { color: c });
    }
  }

  // ---------------------------------------------------------------- clipboard

  function clipFromSelection(): Clip | null {
    const list = [...selectedRef.current]
      .map((id) => notesRef.current[id])
      .filter((n): n is Note => !!n)
      .sort((a, b) => a.y - b.y || a.x - b.x);
    if (list.length === 0) return null;
    const x = Math.min(...list.map((n) => n.x));
    const y = Math.min(...list.map((n) => n.y));
    return {
      text: list.map((n) => n.text).join("\n\n"),
      items: list.map((n) => ({ text: n.text, color: n.color, visibility: n.visibility, labels: n.labels, dx: n.x - x, dy: n.y - y })),
      x,
      y,
    };
  }

  /** Paste centred on the pointer (or the middle of the screen if it's elsewhere). */
  function pasteItems(items: ClipItem[]) {
    if (!viewportRef.current || items.length === 0) return;
    const at = lastPointer.current ? toWorld(lastPointer.current.x, lastPointer.current.y) : viewportCentre();
    const w = Math.max(...items.map((i) => i.dx)) + NOTE_W;
    const h = Math.max(...items.map((i) => i.dy)) + NOTE_H;
    let x = Math.round(at.x - w / 2);
    let y = Math.round(at.y - h / 2);
    const key = `${x},${y}`;
    pasteSpot.current = pasteSpot.current?.key === key ? { key, n: pasteSpot.current.n + 1 } : { key, n: 0 };
    x += pasteSpot.current.n * PASTE_STEP;
    y += pasteSpot.current.n * PASTE_STEP;
    void createMany(items.map((i) => ({ text: i.text, color: i.color, visibility: i.visibility, labels: i.labels ?? filterLabels(), x: x + i.dx, y: y + i.dy })));
  }

  function duplicateSelection() {
    const clip = clipFromSelection();
    if (!clip) return;
    void createMany(clip.items.map((i) => ({ text: i.text, color: i.color, visibility: i.visibility, labels: i.labels ?? [], x: clip.x + i.dx + PASTE_STEP, y: clip.y + i.dy + PASTE_STEP })));
  }

  // ---------------------------------------------------------------- keyboard

  function moveSelectionBy(dx: number, dy: number) {
    const sel = [...selectedRef.current];
    const ids = sel.filter((id) => {
      const lock = locksRef.current[id];
      return notesRef.current[id]?.canMove && !(lock && !lock.mine);
    });
    if (ids.length === 0) {
      const held = sel.map((id) => locksRef.current[id]).find((l) => l && !l.mine);
      return flash(held ? `${held.holder} is moving that note right now.` : "You can only move your own notes here.");
    }
    const prevIds = keyMove.current?.ids ?? [];
    if (keyMove.current) window.clearTimeout(keyMove.current.timer);
    const moved: Record<number, { x: number; y: number }> = {};
    for (const id of ids) moved[id] = { x: notesRef.current[id].x + dx, y: notesRef.current[id].y + dy };
    notesRef.current = { ...notesRef.current };
    for (const id of ids) notesRef.current[id] = { ...notesRef.current[id], ...moved[id] };
    setNotes(notesRef.current);
    for (const id of ids) {
      if (!prevIds.includes(id)) sockRef.current?.send({ type: "lock:acquire", id });
      sockRef.current?.send({ type: "note:move", id, x: moved[id].x, y: moved[id].y });
    }
    keyRevealNote(moved[ids[0]].x, moved[ids[0]].y);
    const all = [...new Set([...prevIds, ...ids])];
    // save once the keys go quiet
    const timer = window.setTimeout(() => {
      keyMove.current = null;
      for (const id of all) {
        const n = notesRef.current[id];
        if (n) void patchNote(id, { x: n.x, y: n.y }).finally(() => sockRef.current?.send({ type: "lock:release", id }));
      }
    }, 400);
    keyMove.current = { ids: all, timer };
  }

  /** Keep a note being moved by keyboard inside the viewport. */
  function keyRevealNote(x: number, y: number) {
    const el = viewportRef.current;
    if (!el) return;
    setView((v) => {
      const sx = x * v.s + v.ox;
      const sy = y * v.s + v.oy;
      const pad = 24;
      let { ox, oy } = v;
      if (sx < pad) ox += pad - sx;
      if (sy < pad) oy += pad - sy;
      if (sx + NOTE_W * v.s > el.clientWidth - pad) ox -= sx + NOTE_W * v.s - (el.clientWidth - pad);
      if (sy + NOTE_H * v.s > el.clientHeight - pad) oy -= sy + NOTE_H * v.s - (el.clientHeight - pad);
      return ox === v.ox && oy === v.oy ? v : { ...v, ox, oy };
    });
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape" && (labelOpen || filterOpen)) {
      setLabelOpen(false);
      setFilterOpen(false);
      return;
    }
    if (isTyping(e.target) || editingRef.current !== null || helpOpen || accessOpen || labelOpen || filterOpen) return;
    const onControl = e.target instanceof HTMLElement && !!e.target.closest("button, a");
    const sel = selectedRef.current;
    if (e.metaKey || e.ctrlKey) {
      const k = e.key.toLowerCase();
      if (k === "a") {
        e.preventDefault();
        select(Object.values(notesRef.current).filter(shown).map((n) => n.id));
      } else if (k === "d" && sel.size) {
        e.preventDefault();
        duplicateSelection();
      } else if ((k === "c" || k === "x") && sel.size) {
        // the copy/cut event fills the system clipboard; this copy is the fallback when that event doesn't come
        clipRef.current = clipFromSelection();
        if (k === "x") window.setTimeout(deleteSelection, 0); // after the cut event has read the selection
      } else if (k === "v") {
        if (pasteTimer.current) window.clearTimeout(pasteTimer.current);
        pasteTimer.current = window.setTimeout(() => {
          pasteTimer.current = null;
          if (clipRef.current) pasteItems(clipRef.current.items);
        }, 80);
      } else if (k === "=" || k === "+") {
        e.preventDefault();
        zoomAt(1.2);
      } else if (k === "-") {
        e.preventDefault();
        zoomAt(1 / 1.2);
      } else if (k === "0") {
        e.preventDefault();
        zoomAt(1 / viewRef.current.s);
      }
      return;
    }
    if (e.altKey) return;
    const step = e.shiftKey ? 50 : 10;
    const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (arrows[e.key]) {
      e.preventDefault();
      const [ax, ay] = arrows[e.key];
      if (sel.size) moveSelectionBy(ax * step, ay * step);
      else {
        stopFollowing();
        setView((v) => ({ ...v, ox: v.ox - ax * 60, oy: v.oy - ay * 60 }));
      }
      return;
    }
    switch (e.key) {
      case " ":
        if (onControl) return;
        e.preventDefault();
        if (!spaceRef.current) {
          spaceRef.current = true;
          setSpaceHeld(true);
        }
        return;
      case "Enter": {
        if (onControl || sel.size !== 1) return;
        const id = [...sel][0];
        if (notesRef.current[id]?.canEdit) {
          e.preventDefault();
          setEditing(id);
        }
        return;
      }
      case "Delete":
      case "Backspace":
        if (!sel.size) return;
        e.preventDefault();
        deleteSelection();
        return;
      case "Escape":
        stopFollowing();
        select([]);
        if (document.activeElement instanceof HTMLElement && document.activeElement.closest(".note")) viewportRef.current?.focus();
        return;
      case "n":
      case "N":
        e.preventDefault();
        createAtCentre();
        return;
      case "h":
      case "H":
        setTool("hand");
        return;
      case "l":
      case "L":
        if (sel.size) {
          e.preventDefault();
          setLabelOpen(true);
        }
        return;
      case "v":
      case "V":
      case "1":
        setTool("select");
        return;
      case "+":
      case "=":
        zoomAt(1.2);
        return;
      case "-":
        zoomAt(1 / 1.2);
        return;
      case "0":
        zoomAt(1 / viewRef.current.s);
        return;
      case "!": // shift+1
        fitAll();
        return;
      case "?":
        setHelpOpen(true);
        return;
    }
  }

  function onKeyUp(e: KeyboardEvent) {
    if (e.key === " " && spaceRef.current) {
      spaceRef.current = false;
      setSpaceHeld(false);
    }
  }

  function onCopy(e: ClipboardEvent, cut: boolean) {
    if (isTyping(e.target) || editingRef.current !== null || window.getSelection()?.toString()) return;
    const clip = clipFromSelection();
    if (!clip || !e.clipboardData) return;
    e.preventDefault();
    clipRef.current = clip;
    e.clipboardData.setData("text/plain", clip.text);
    e.clipboardData.setData(CLIP_MIME, JSON.stringify(clip.items));
    if (cut && !keyMove.current) flash(`Cut ${clip.items.length === 1 ? "1 note" : `${clip.items.length} notes`}.`);
  }

  function onPaste(e: ClipboardEvent) {
    if (isTyping(e.target) || editingRef.current !== null || !e.clipboardData) return;
    if (pasteTimer.current) window.clearTimeout(pasteTimer.current);
    pasteTimer.current = null;
    e.preventDefault();
    const raw = e.clipboardData.getData(CLIP_MIME);
    if (raw) {
      try {
        const items = JSON.parse(raw) as ClipItem[];
        if (Array.isArray(items) && items.length) return pasteItems(items);
      } catch {
        /* not ours after all */
      }
    }
    const text = e.clipboardData.getData("text/plain");
    // some browsers drop the custom type; the plain text still tells us it was our own copy
    if (clipRef.current && text === clipRef.current.text) return pasteItems(clipRef.current.items);
    if (text.trim()) pasteItems([{ text: text.trim(), color: newColor, visibility: "public", labels: filterLabels(), dx: 0, dy: 0 }]);
  }

  const keyHandlers = useRef({ onKeyDown, onKeyUp, onCopy, onPaste });
  keyHandlers.current = { onKeyDown, onKeyUp, onCopy, onPaste };
  useEffect(() => {
    const down = (e: KeyboardEvent) => keyHandlers.current.onKeyDown(e);
    const up = (e: KeyboardEvent) => keyHandlers.current.onKeyUp(e);
    const copy = (e: ClipboardEvent) => keyHandlers.current.onCopy(e, false);
    const cut = (e: ClipboardEvent) => keyHandlers.current.onCopy(e, true);
    const paste = (e: ClipboardEvent) => keyHandlers.current.onPaste(e);
    const blur = () => {
      spaceRef.current = false;
      setSpaceHeld(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    document.addEventListener("copy", copy);
    document.addEventListener("cut", cut);
    document.addEventListener("paste", paste);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      document.removeEventListener("copy", copy);
      document.removeEventListener("cut", cut);
      document.removeEventListener("paste", paste);
    };
  }, []);

  // ---------------------------------------------------------------- pointer gestures

  function sendCursor(clientX: number, clientY: number) {
    const now = Date.now();
    if (now - lastCursorRef.current < CURSOR_EVERY_MS) return;
    lastCursorRef.current = now;
    const w = toWorld(clientX, clientY);
    sockRef.current?.send({ type: "cursor", x: Math.round(w.x), y: Math.round(w.y) });
  }

  function startPinchIfTwo(): boolean {
    const ps = [...pointersRef.current.entries()];
    if (ps.length < 2) return false;
    const [[ida, a], [idb, b]] = ps;
    const g = gestureRef.current;
    if (g.mode === "drag") return false; // a drag in progress keeps going
    if (g.mode === "pending" && g.timer) window.clearTimeout(g.timer);
    if (g.mode === "marquee") setMarquee(null);
    const rect = viewportRef.current!.getBoundingClientRect();
    gestureRef.current = {
      mode: "pinch",
      ids: [ida, idb],
      dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      mid: { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top },
      view: viewRef.current,
    };
    return true;
  }

  const panning = (e: ReactPointerEvent) => e.pointerType === "touch" || e.button === 1 || toolRef.current === "hand" || spaceRef.current;

  function onBackgroundDown(e: ReactPointerEvent, fromNote = false) {
    if (e.pointerType === "mouse" && e.button !== 0 && e.button !== 1) return;
    if (e.button === 1) e.preventDefault(); // no autoscroll
    stopFollowing();
    viewportRef.current?.setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (startPinchIfTwo()) return;
    if (fromNote || panning(e)) {
      const v = viewRef.current;
      gestureRef.current = { mode: "pan", pointerId: e.pointerId, sx: e.clientX, sy: e.clientY, ox: v.ox, oy: v.oy, moved: false, fromNote };
      return;
    }
    // drag on empty canvas draws a selection box; shift adds to what's selected
    const w = toWorld(e.clientX, e.clientY);
    gestureRef.current = { mode: "marquee", pointerId: e.pointerId, x0: w.x, y0: w.y, base: e.shiftKey ? [...selectedRef.current] : [] };
    if (!e.shiftKey) select([]);
  }

  function onNoteDown(e: ReactPointerEvent, note: Note) {
    e.stopPropagation();
    if (editing === note.id) return; // let the textarea have it
    if (e.pointerType === "mouse" && e.button !== 0) return onBackgroundDown(e, true);
    if (panning(e) && e.pointerType !== "touch") return onBackgroundDown(e, true);
    pointerFocus.current = true;
    window.setTimeout(() => (pointerFocus.current = false), 0);
    const sel = selectedRef.current;
    let collapse = false;
    if (e.shiftKey) {
      const next = new Set(sel);
      if (next.has(note.id)) next.delete(note.id);
      else next.add(note.id);
      select(next);
      if (!next.has(note.id)) return;
    } else if (!sel.has(note.id)) select([note.id]);
    else collapse = sel.size > 1; // a click (not a drag) on one of a group selects just that one
    if (!note.canMove) return onBackgroundDown(e, true);
    const lock = locks[note.id];
    if (lock && !lock.mine) {
      flash(`${lock.holder} is moving that note right now.`);
      return onBackgroundDown(e, true);
    }
    viewportRef.current?.setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (startPinchIfTwo()) return;
    const touch = e.pointerType === "touch";
    const v = viewRef.current;
    const g: Gesture = { mode: "pending", pointerId: e.pointerId, noteId: note.id, sx: e.clientX, sy: e.clientY, touch, timer: null, pan: { ox: v.ox, oy: v.oy }, collapse };
    if (touch) {
      // on a phone, a finger on a note pans unless it's held still: long-press to drag
      g.timer = window.setTimeout(() => {
        const cur = gestureRef.current;
        if (cur.mode === "pending" && cur.pointerId === g.pointerId) {
          navigator.vibrate?.(15);
          startDrag(cur.pointerId, cur.sx, cur.sy);
        }
      }, LONG_PRESS_MS);
    }
    gestureRef.current = g;
  }

  /** Drag everything selected that this user may move. */
  function startDrag(pointerId: number, clientX: number, clientY: number) {
    const ids = [...selectedRef.current].filter((id) => {
      const lock = locksRef.current[id];
      return notesRef.current[id]?.canMove && !(lock && !lock.mine);
    });
    if (ids.length === 0) return;
    const origs: Record<number, { x: number; y: number }> = {};
    for (const id of ids) origs[id] = { x: notesRef.current[id].x, y: notesRef.current[id].y };
    const w = toWorld(clientX, clientY);
    gestureRef.current = { mode: "drag", pointerId, ids, sx: w.x, sy: w.y, origs, moved: false, lastSent: 0 };
    for (const id of ids) sockRef.current?.send({ type: "lock:acquire", id });
  }

  function onPointerMove(e: ReactPointerEvent) {
    lastPointer.current = { x: e.clientX, y: e.clientY };
    sendCursor(e.clientX, e.clientY);
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gestureRef.current;
    switch (g.mode) {
      case "pan": {
        if (g.pointerId !== e.pointerId) return;
        const dx = e.clientX - g.sx;
        const dy = e.clientY - g.sy;
        if (Math.abs(dx) + Math.abs(dy) > 3) g.moved = true;
        setView((v) => ({ ...v, ox: g.ox + dx, oy: g.oy + dy }));
        return;
      }
      case "pinch": {
        const a = pointersRef.current.get(g.ids[0]);
        const b = pointersRef.current.get(g.ids[1]);
        if (!a || !b) return;
        const rect = viewportRef.current!.getBoundingClientRect();
        const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const mid = { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top };
        const s = clamp(g.view.s * (dist / g.dist), MIN_SCALE, MAX_SCALE);
        const wx = (g.mid.x - g.view.ox) / g.view.s;
        const wy = (g.mid.y - g.view.oy) / g.view.s;
        setView({ s, ox: mid.x - wx * s, oy: mid.y - wy * s });
        return;
      }
      case "marquee": {
        if (g.pointerId !== e.pointerId) return;
        const w = toWorld(e.clientX, e.clientY);
        const r = { x0: g.x0, y0: g.y0, x1: w.x, y1: w.y };
        setMarquee(r);
        const n = norm(r);
        // a note is caught as soon as the box touches it
        const hits = Object.values(notesRef.current)
          .filter((note) => shown(note) && note.x < n.x1 && note.x + NOTE_W > n.x0 && note.y < n.y1 && note.y + NOTE_H > n.y0)
          .map((note) => note.id);
        select([...g.base, ...hits]);
        return;
      }
      case "pending": {
        if (g.pointerId !== e.pointerId) return;
        const dist = Math.hypot(e.clientX - g.sx, e.clientY - g.sy);
        if (g.touch) {
          if (dist > 8) {
            if (g.timer) window.clearTimeout(g.timer);
            gestureRef.current = { mode: "pan", pointerId: g.pointerId, sx: g.sx, sy: g.sy, ox: g.pan.ox, oy: g.pan.oy, moved: true };
            onPointerMove(e);
          }
        } else if (dist > 3) {
          startDrag(g.pointerId, g.sx, g.sy);
          onPointerMove(e);
        }
        return;
      }
      case "drag": {
        if (g.pointerId !== e.pointerId) return;
        const w = toWorld(e.clientX, e.clientY);
        const dx = w.x - g.sx;
        const dy = w.y - g.sy;
        g.moved = true;
        const pos: Record<number, { x: number; y: number }> = {};
        for (const id of g.ids) pos[id] = { x: Math.round(g.origs[id].x + dx), y: Math.round(g.origs[id].y + dy) };
        setNotes((prev) => {
          const next = { ...prev };
          for (const id of g.ids) if (next[id]) next[id] = { ...next[id], ...pos[id] };
          return next;
        });
        const now = Date.now();
        if (now - g.lastSent >= MOVE_EVERY_MS) {
          g.lastSent = now;
          for (const id of g.ids) sockRef.current?.send({ type: "note:move", id, ...pos[id] });
        }
        return;
      }
    }
  }

  function onPointerUp(e: ReactPointerEvent) {
    pointersRef.current.delete(e.pointerId);
    const g = gestureRef.current;
    if (g.mode === "pinch") {
      // lifting one finger of a pinch carries on as a pan with the other
      const rest = [...pointersRef.current.entries()][0];
      const v = viewRef.current;
      gestureRef.current = rest ? { mode: "pan", pointerId: rest[0], sx: rest[1].x, sy: rest[1].y, ox: v.ox, oy: v.oy, moved: true } : { mode: "none" };
      return;
    }
    if (("pointerId" in g && g.pointerId !== e.pointerId) || g.mode === "none") return;
    gestureRef.current = { mode: "none" };
    if (g.mode === "marquee") setMarquee(null);
    if (g.mode === "pan" && !g.moved && !g.fromNote && e.type === "pointerup") select([]);
    if (g.mode === "pending") {
      if (g.timer) window.clearTimeout(g.timer);
      if (g.collapse && e.type === "pointerup") select([g.noteId]);
    }
    if (g.mode === "drag") {
      for (const id of g.ids) {
        const note = notesRef.current[id];
        const finish = () => sockRef.current?.send({ type: "lock:release", id });
        if (g.moved && note && e.type === "pointerup") {
          void patchNote(id, { x: note.x, y: note.y, front: true }).finally(finish);
        } else {
          if (g.moved) setNotes((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], ...g.origs[id] } } : prev));
          finish();
        }
      }
    }
  }

  function onBackgroundDoubleClick(e: ReactMouseEvent) {
    if (e.target !== e.currentTarget && !(e.target as HTMLElement).classList.contains("world")) return;
    const w = toWorld(e.clientX, e.clientY);
    // pointer capture sends a double-click on a note here too, so look for one under the pointer first
    const hit = Object.values(notesRef.current)
      .filter((n) => shown(n) && w.x >= n.x && w.x <= n.x + NOTE_W && w.y >= n.y && w.y <= n.y + NOTE_H)
      .sort((a, b) => b.z - a.z)[0];
    if (hit) {
      if (hit.canEdit) {
        select([hit.id]);
        setEditing(hit.id);
      }
      return;
    }
    void createNoteAt(w.x - NOTE_W / 2, w.y - NOTE_H / 2);
  }

  // ---------------------------------------------------------------- render

  if (loadError)
    return (
      <>
        <Header />
        <main className="page">
          <h1>Not found</h1>
          <p>{loadError}</p>
          <Link to="/">Back to your board</Link>
        </main>
      </>
    );

  if (gate) return <JoinGate slug={slug} gate={gate} onJoined={() => void load(true)} />;

  const sorted = Object.values(notes).sort((a, b) => a.z - b.z);
  const selNotes = [...selected].map((id) => notes[id]).filter((n): n is Note => !!n);
  const title = !board ? "" : board.kind === "channel" ? `#${board.slug}` : board.isOwner ? "Your board" : `${board.owner}'s board`;
  const others = peers.filter((p) => p.sid !== mySid);
  const followed = following ? peers.find((p) => p.sid === following) : undefined;
  // every label on the board, as first written, with how many notes carry it
  const labelMap = new Map<string, { label: string; count: number }>();
  for (const n of sorted)
    for (const l of n.labels) {
      const e = labelMap.get(l.toLowerCase());
      if (e) e.count++;
      else labelMap.set(l.toLowerCase(), { label: l, count: 1 });
    }
  const boardLabels = [...labelMap.values()].sort((a, b) => a.label.localeCompare(b.label));
  const hiddenCount = filter.size ? sorted.filter((n) => !shown(n)).length : 0;
  const filterName = filter.size === 1 ? (labelMap.get([...filter][0])?.label ?? [...filter][0]) : `${filter.size} labels`;
  const grid = 24 * view.s;
  const selColor = selNotes.length && selNotes.every((n) => n.color === selNotes[0].color) ? selNotes[0].color : selNotes.length ? null : newColor;
  const groupBox =
    selNotes.length > 1
      ? {
          x0: Math.min(...selNotes.map((n) => n.x)),
          y0: Math.min(...selNotes.map((n) => n.y)),
          x1: Math.max(...selNotes.map((n) => n.x + NOTE_W)),
          y1: Math.max(...selNotes.map((n) => n.y + NOTE_H)),
        }
      : null;
  const toScreen = (r: Rect) => {
    const n = norm(r);
    return { left: n.x0 * view.s + view.ox, top: n.y0 * view.s + view.oy, width: (n.x1 - n.x0) * view.s, height: (n.y1 - n.y0) * view.s };
  };
  const grabbing = tool === "hand" || spaceHeld;

  return (
    <div className="board-page">
      <div className="board-body">
        <div
          ref={viewportRef}
          className={`viewport${grabbing ? " panning" : ""}`}
          tabIndex={0}
          role="application"
          aria-label={`${title}: infinite canvas. Arrow keys pan, plus and minus zoom, N adds a note, Tab moves between notes, question mark lists shortcuts.`}
          style={{ backgroundSize: `${grid}px ${grid}px`, backgroundPosition: `${view.ox}px ${view.oy}px` }}
          onPointerDown={onBackgroundDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={() => (lastPointer.current = null)}
          onDoubleClick={onBackgroundDoubleClick}
        >
          <div className="world" style={{ transform: `translate(${view.ox}px, ${view.oy}px) scale(${view.s})` }}>
            {sorted.map((n) => (
              <NoteCard
                key={tempKeys.current.get(n.id) ?? n.id}
                note={n}
                selected={selected.has(n.id)}
                editing={editing === n.id}
                lock={locks[n.id]}
                dragging={dragIds().includes(n.id)}
                showAuthor={n.author !== me.username}
                filteredOut={!shown(n)}
                isBoardOwnersView={!!board?.isOwner}
                onPointerDown={(e) => onNoteDown(e, n)}
                onFocus={() => {
                  if (!pointerFocus.current && !selectedRef.current.has(n.id)) select([n.id]);
                }}
                onDoubleClick={() => n.canEdit && setEditing(n.id)}
                onFinishEdit={(text) => void finishEdit(n.id, text)}
              />
            ))}
          </div>
          {groupBox && <div className="group-box" style={toScreen(groupBox)} aria-hidden />}
          {marquee && <div className="marquee" style={toScreen(marquee)} aria-hidden />}
          {Object.entries(cursors).map(([sid, c]) => (
            <div
              key={sid}
              className="cursor"
              style={{ transform: `translate(${c.x * view.s + view.ox}px, ${c.y * view.s + view.oy}px)`, "--peer": peerColor(sid) } as CSSProperties}
              aria-hidden
            >
              <svg width="16" height="20" viewBox="0 0 16 20">
                <path d="M1 1 L1 16 L5 12 L8 19 L11 18 L8 11 L14 11 Z" stroke="#fff" strokeWidth="1.2" />
              </svg>
              <span className="cursor-name">{c.name ?? "Someone"}</span>
            </div>
          ))}
          {board && sorted.length === 0 && (
            <div className="empty-hint">
              <p className="empty-title">{board.isOwner ? "Your board is empty" : board.kind === "user" ? `${board.owner}'s board is empty` : "No notes yet"}</p>
              <p>
                Double-click anywhere to add a note, or press <kbd>N</kbd>.
              </p>
            </div>
          )}
          {sorted.length > 0 && hiddenCount === sorted.length && (
            <div className="empty-hint">
              <p className="empty-title">No notes labelled {filterName}</p>
              <p>New notes you add now get that label.</p>
            </div>
          )}
        </div>

        {board?.kind === "channel" && (
          <Chat
            open={chatOpen}
            onToggle={() => setChatOpen((o) => !o)}
            register={(h) => (chatHandler.current = h)}
            send={(m) => sockRef.current?.send(m)}
            live={status === "open"}
            me={me.username}
          />
        )}

        {followed && <div className="follow-frame" style={{ "--peer": peerColor(followed.sid) } as CSSProperties} aria-hidden />}

        {status !== "open" && board && joinedOnce.current && (
          // an overlay, so the canvas doesn't jump when the connection drops
          <div className="banner" role="status">
            Offline. Reconnecting… Your changes are still being saved.
          </div>
        )}
      </div>

      <div className="island-row top-left">
        <MainMenu onHelp={() => setHelpOpen(true)} />
        <div className="menu">
          <button
            className={`island tool filter-button${filter.size ? " on" : ""}`}
            aria-expanded={filterOpen}
            onClick={() => setFilterOpen((o) => !o)}
            title="Show only notes with certain labels"
          >
            <svg viewBox="0 0 20 20" aria-hidden>
              <path d="M3.5 5h13l-5 6v4.5l-3 1.5V11Z" />
            </svg>
            <span>{filter.size ? filterName : "Labels"}</span>
          </button>
          {filterOpen && (
            <FilterPop
              labels={boardLabels}
              filter={filter}
              hidden={hiddenCount}
              onChange={(f) => setFilter(f)}
              onClose={() => setFilterOpen(false)}
            />
          )}
        </div>
        {board && !board.isOwner && (
          <div className="island board-label">
            {board.kind === "user" && (
              <Link to={boardPath("user", me.username, me.username)} className="back-link" title="Back to your board">
                ←
              </Link>
            )}
            <span>{title}</span>
          </div>
        )}
      </div>

      {others.length > 0 && (
        <div className="island presence-row" role="group" aria-label="People on this board">
          {others.slice(0, 6).map((p) => (
            <button
              key={p.sid}
              className={`avatar-btn${following === p.sid ? " on" : ""}`}
              style={{ "--peer": peerColor(p.sid) } as CSSProperties}
              aria-pressed={following === p.sid}
              title={following === p.sid ? `Stop following ${p.name ?? "them"}` : `${p.name ?? "Someone (anonymous)"}: click to follow`}
              onClick={() => follow(p.sid)}
            >
              {p.name ? p.name[0].toUpperCase() : "?"}
            </button>
          ))}
          {others.length > 6 && (
            <span className="avatar-more" title={others.slice(6).map((p) => p.name ?? "Someone").join(", ")}>
              +{others.length - 6}
            </span>
          )}
        </div>
      )}

      {followed && (
        <div className="island follow-chip" style={{ "--peer": peerColor(followed.sid) } as CSSProperties} role="status">
          <span>
            Following <strong>{followed.name ?? "someone"}</strong>
          </span>
          <button className="quiet" onClick={() => follow(null)}>
            Stop
          </button>
        </div>
      )}

      <div className="island tools" role="toolbar" aria-label="Tools">
        <button className={`tool${tool === "hand" ? " on" : ""}`} aria-pressed={tool === "hand"} onClick={() => setTool("hand")} title="Hand: drag to move around (H, or hold Space)">
          <svg viewBox="0 0 20 20" aria-hidden>
            <path d="M7 10V4.5a1.25 1.25 0 0 1 2.5 0V9m0-.5V3.5a1.25 1.25 0 0 1 2.5 0V9m0-.5V4.5a1.25 1.25 0 0 1 2.5 0V12a5.5 5.5 0 0 1-5.5 5.5H9a5 5 0 0 1-4-2L3 12.6a1.3 1.3 0 0 1 2-1.6L7 13" />
          </svg>
          <span className="sr-only">Hand</span>
        </button>
        <button className={`tool${tool === "select" ? " on" : ""}`} aria-pressed={tool === "select"} onClick={() => setTool("select")} title="Select: click or drag a box (V)">
          <svg viewBox="0 0 20 20" aria-hidden>
            <path d="M5 3.5 15.5 10l-4.6 1.2 2.6 4.8-1.8 1-2.6-4.8L5.8 15Z" />
          </svg>
          <span className="sr-only">Select</span>
        </button>
        <span className="tool-sep" aria-hidden />
        <button className="tool add" onClick={createAtCentre} title="Add a note (N)">
          <svg viewBox="0 0 20 20" aria-hidden>
            <path d="M4 3.5h12a.5.5 0 0 1 .5.5v8.5l-4 4H4a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5Zm8.5 13V13a.5.5 0 0 1 .5-.5h3.5" />
          </svg>
          <span>Note</span>
        </button>
        <span className="tool-sep" aria-hidden />
        <div className="swatches" role="radiogroup" aria-label={selNotes.length ? "Colour of the selected notes" : "Colour for new notes"}>
          {COLORS.map((c) => (
            <button
              key={c}
              role="radio"
              aria-checked={selColor === c}
              aria-label={COLOR_NAMES[c]}
              title={COLOR_NAMES[c]}
              className={`swatch c-${c}${selColor === c ? " on" : ""}`}
              onClick={() => recolourSelection(c)}
            />
          ))}
        </div>
      </div>

      {selNotes.length > 0 && editing === null && (
        <div className="island selection" role="toolbar" aria-label="Selected notes">
          <span className="sel-count">{selNotes.length === 1 ? "1 note" : `${selNotes.length} notes`}</span>
          {selNotes.length === 1 && selNotes[0].canEdit && (
            <button className="quiet" onClick={() => setEditing(selNotes[0].id)} title="Edit (Enter, or double-click)">
              Edit
            </button>
          )}
          {selNotes.some((n) => n.canEdit) && (
            <button className={`quiet${labelOpen ? " on" : ""}`} aria-expanded={labelOpen} onClick={() => setLabelOpen((o) => !o)} title="Label (L)">
              Label
            </button>
          )}
          <button className="quiet" onClick={duplicateSelection} title="Duplicate (⌘D / Ctrl+D)">
            Duplicate
          </button>
          {selNotes.some((n) => n.canMove) && (
            <button className="quiet danger-text" onClick={deleteSelection} title="Delete (Delete or Backspace)">
              Delete
            </button>
          )}
          {labelOpen && <LabelPop notes={selNotes} labels={boardLabels} onApply={applyLabel} onClose={() => setLabelOpen(false)} />}
        </div>
      )}

      <div className="island zoom" role="group" aria-label="Zoom">
        <button className="tool" onClick={() => zoomAt(1 / 1.2)} aria-label="Zoom out" title="Zoom out (−)">
          −
        </button>
        <button className="tool pct" onClick={() => zoomAt(1 / view.s)} title="Reset zoom (0)">
          {Math.round(view.s * 100)}%
        </button>
        <button className="tool" onClick={() => zoomAt(1.2)} aria-label="Zoom in" title="Zoom in (+)">
          +
        </button>
        <span className="tool-sep" aria-hidden />
        <button className="tool pct" onClick={fitAll} title="Show all notes (Shift+1)">
          Fit
        </button>
        {board?.kind === "channel" && board.isOwner && (
          <button className="tool pct" onClick={() => setAccessOpen(true)}>
            Access
          </button>
        )}
      </div>

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
      {helpOpen && <ShortcutsDialog onClose={() => setHelpOpen(false)} />}
      {accessOpen && board && <AccessDialog board={board} onClose={() => setAccessOpen(false)} onSaved={(b) => setBoard(b)} />}
    </div>
  );
}

// ---------------------------------------------------------------- menu & help

function MainMenu({ onHelp }: { onHelp: () => void }) {
  const { me, setMe } = useSession();
  const [open, setOpen] = useState(false);
  async function logout() {
    await api("POST", "/api/logout").catch(() => {});
    history.replaceState(null, "", "/");
    setMe(null);
  }
  return (
    <div className="menu">
      <button className="island tool menu-button" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((o) => !o)} title="Menu">
        <svg viewBox="0 0 20 20" aria-hidden>
          <path d="M4 6h12M4 10h12M4 14h12" />
        </svg>
        <span className="sr-only">Menu</span>
      </button>
      {open && (
        <>
          <div className="menu-backdrop" onPointerDown={() => setOpen(false)} />
          <div className="island menu-pop" role="menu" onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
            <p className="menu-who">
              Signed in as <strong>{me.username}</strong>
            </p>
            <button
              role="menuitem"
              autoFocus
              onClick={() => {
                setOpen(false);
                onHelp();
              }}
            >
              Keyboard shortcuts <kbd>?</kbd>
            </button>
            <Link to="/settings" className="menu-item">
              Settings
            </Link>
            <button role="menuitem" onClick={logout}>
              Log out
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";
const SHORTCUTS: [string, string][] = [
  ["Add a note", "N, or double-click the canvas"],
  ["Edit the selected note", "Enter, or double-click it"],
  ["Select several", "Drag a box, or Shift-click"],
  ["Select all", `${mod} A`],
  ["Copy, cut, paste", `${mod} C, ${mod} X, ${mod} V`],
  ["Duplicate", `${mod} D`],
  ["Label the selection", "L"],
  ["Follow someone", "Click their avatar, top right (Esc stops)"],
  ["Delete", "Delete or Backspace"],
  ["Move the selection", "Arrow keys (Shift for bigger steps)"],
  ["Move around", "Scroll, hold Space and drag, or H"],
  ["Select tool", "V"],
  ["Zoom", `${mod} scroll, + and −, 0 resets`],
  ["Show all notes", "Shift 1"],
  ["Clear the selection", "Esc"],
];

function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="dialog-backdrop" onPointerDown={onClose}>
      <div
        className="island dialog"
        role="dialog"
        aria-label="Keyboard shortcuts"
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
      >
        <div className="dialog-head">
          <h2>Keyboard shortcuts</h2>
          <button className="tool" onClick={onClose} autoFocus aria-label="Close">
            ×
          </button>
        </div>
        <table className="shortcuts">
          <tbody>
            {SHORTCUTS.map(([what, keys]) => (
              <tr key={what}>
                <th scope="row">{what}</th>
                <td>{keys}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- labels

type LabelCount = { label: string; count: number };

function FilterPop(props: { labels: LabelCount[]; filter: Set<string>; hidden: number; onChange: (f: Set<string>) => void; onClose: () => void }) {
  const { labels, filter } = props;
  const toggle = (l: string) => {
    const next = new Set(filter);
    if (next.has(l.toLowerCase())) next.delete(l.toLowerCase());
    else next.add(l.toLowerCase());
    props.onChange(next);
  };
  return (
    <>
      <div className="menu-backdrop" onPointerDown={props.onClose} />
      <div className="island menu-pop label-pop" role="dialog" aria-label="Filter by label" onKeyDown={(e) => e.key === "Escape" && props.onClose()}>
        {labels.length === 0 ? (
          <p className="pop-note">No labels yet. Select a note and press L to give it one.</p>
        ) : (
          <>
            <p className="pop-note">Show only notes labelled</p>
            <div className="label-list">
              {labels.map(({ label, count }, i) => (
                <label key={label} className="label-row">
                  <input type="checkbox" checked={filter.has(label.toLowerCase())} onChange={() => toggle(label)} autoFocus={i === 0} />
                  <span className="chip">{label}</span>
                  <span className="label-count">{count}</span>
                </label>
              ))}
            </div>
          </>
        )}
        {filter.size > 0 && (
          <div className="pop-foot">
            <span className="muted">{props.hidden === 1 ? "1 note hidden" : `${props.hidden} notes hidden`}</span>
            <button className="quiet" onClick={() => props.onChange(new Set())}>
              Show all
            </button>
          </div>
        )}
      </div>
    </>
  );
}

function LabelPop(props: { notes: Note[]; labels: LabelCount[]; onApply: (label: string, add: boolean) => void; onClose: () => void }) {
  const [draft, setDraft] = useState("");
  const editable = props.notes.filter((n) => n.canEdit);
  /** On all, some or none of the selected notes. */
  const state = (label: string) => {
    const k = label.toLowerCase();
    const c = editable.filter((n) => n.labels.some((l) => l.toLowerCase() === k)).length;
    return c === 0 ? "none" : c === editable.length ? "all" : "some";
  };
  const query = draft.trim().toLowerCase();
  const options = props.labels.filter((l) => !query || l.label.toLowerCase().includes(query));
  const exact = props.labels.some((l) => l.label.toLowerCase() === query);
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    props.onApply(draft, true);
    setDraft("");
  }
  return (
    <>
      <div className="menu-backdrop" onPointerDown={props.onClose} />
      <div className="island menu-pop label-pop above" role="dialog" aria-label="Labels" onKeyDown={(e) => e.key === "Escape" && props.onClose()}>
        <form onSubmit={submit}>
          <input
            autoFocus
            value={draft}
            maxLength={LABEL_MAX}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={props.labels.length ? "Find or add a label" : "Add a label"}
            aria-label="Label"
          />
        </form>
        <div className="label-list">
          {options.map(({ label }) => {
            const st = state(label);
            return (
              <label key={label} className="label-row">
                <input
                  type="checkbox"
                  checked={st === "all"}
                  ref={(el) => {
                    if (el) el.indeterminate = st === "some";
                  }}
                  onChange={() => props.onApply(label, st !== "all")}
                />
                <span className="chip">{label}</span>
              </label>
            );
          })}
          {query && !exact && (
            <button type="button" className="label-add" onClick={() => (props.onApply(draft, true), setDraft(""))}>
              Add “{draft.trim()}”
            </button>
          )}
        </div>
        {editable.length < props.notes.length && <p className="pop-note">Only your own notes get labels here.</p>}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- one note

function NoteCard(props: {
  note: Note;
  selected: boolean;
  editing: boolean;
  dragging: boolean;
  showAuthor: boolean;
  filteredOut: boolean;
  lock: LockInfo | undefined;
  isBoardOwnersView: boolean;
  onPointerDown: (e: ReactPointerEvent) => void;
  onFocus: () => void;
  onDoubleClick: () => void;
  onFinishEdit: (text: string | null) => void;
}) {
  const { note, selected, editing, lock, dragging } = props;
  const [draft, setDraft] = useState(note.text);
  const done = useRef(false);
  useEffect(() => {
    if (editing) {
      setDraft(note.text);
      done.current = false;
    }
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps

  const finish = (text: string | null) => {
    if (done.current) return;
    done.current = true;
    props.onFinishEdit(text);
  };

  const heldByOther = lock && !lock.mine;
  const isPrivate = note.visibility === "private";
  const label = `Note${props.showAuthor ? ` by ${note.author}` : ""}${isPrivate ? ", private" : ""}${note.labels.length ? `, labelled ${note.labels.join(", ")}` : ""}: ${note.text || "empty"}`;
  return (
    <div
      data-note={note.id}
      className={`note c-${note.color}${selected ? " selected" : ""}${editing ? " editing" : ""}${dragging ? " dragging" : ""}${heldByOther ? " held" : ""}${note.canMove ? " movable" : ""}${props.filteredOut ? " filtered-out" : ""}`}
      style={{ left: note.x, top: note.y, width: NOTE_W, height: NOTE_H, zIndex: dragging ? 1_000_000 : note.z }}
      tabIndex={props.filteredOut ? -1 : 0}
      aria-hidden={props.filteredOut || undefined}
      role="group"
      aria-label={label}
      aria-roledescription="note"
      onPointerDown={props.onPointerDown}
      onFocus={props.onFocus}
      onDoubleClick={(e) => {
        e.stopPropagation();
        props.onDoubleClick();
      }}
    >
      {editing ? (
        <form
          className="note-edit"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            finish(draft);
          }}
        >
          <textarea
            autoFocus
            aria-label="Note text"
            value={draft}
            maxLength={NOTE_MAX}
            onFocus={(e) => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => finish(draft)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Escape") finish(draft);
              else if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                finish(draft);
              }
            }}
            placeholder="Write something"
          />
          {draft.length > NOTE_MAX - 40 && <span className="count">{NOTE_MAX - draft.length}</span>}
        </form>
      ) : (
        <p className="note-text">{note.text || <span className="placeholder">{note.canEdit ? "Double-click to write" : "Empty"}</span>}</p>
      )}
      {(props.showAuthor || isPrivate || note.labels.length > 0) && (
        <footer className="note-foot">
          <span className="chips">
            {note.labels.map((l) => (
              <span key={l} className="chip">
                {l}
              </span>
            ))}
          </span>
          <span className="meta">
            {props.showAuthor && <span className="author">{note.author}</span>}
            {isPrivate && (
              <span className="badge" title={props.isBoardOwnersView ? "Only you and its author can see this" : "Only you and the board's owner can see this"}>
                private
              </span>
            )}
          </span>
        </footer>
      )}
      {heldByOther && <div className="held-by">{lock!.holder} is moving this</div>}
    </div>
  );
}

// ---------------------------------------------------------------- channel gates

function JoinGate({ slug, gate, onJoined }: { slug: string; gate: { visibility: string; message: string }; onJoined: () => void }) {
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api("POST", `/api/channels/${encodeURIComponent(slug)}/join`, { key });
      onJoined();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "couldn't join");
    }
  }
  return (
    <>
      <Header />
      <main className="page narrow">
        <h1>#{slug}</h1>
        {gate.visibility === "key" ? (
          <form className="card" onSubmit={submit}>
            <p>This channel is private. Enter its key to join; you'll only need it once.</p>
            <label>
              Key
              <input type="password" value={key} onChange={(e) => setKey(e.target.value)} autoFocus autoComplete="off" required />
            </label>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button className="primary" type="submit">
              Join
            </button>
          </form>
        ) : (
          <p className="card">{gate.visibility === "list" ? "This channel is invite-only. Ask the person who made it to add your username." : gate.message}</p>
        )}
        <p>
          <Link to="/">Back home</Link>
        </p>
      </main>
    </>
  );
}

function AccessDialog({ board, onClose, onSaved }: { board: BoardInfo; onClose: () => void; onSaved: (b: BoardInfo) => void }) {
  const [allow, setAllow] = useState((board.access?.allow ?? []).join(", "));
  const [deny, setDeny] = useState((board.access?.deny ?? []).join(", "));
  const [error, setError] = useState<string | null>(null);
  const names = (s: string) =>
    s
      .split(/[\s,]+/)
      .map((x) => x.trim())
      .filter(Boolean);
  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      const r = await api<{ board: BoardInfo }>("PUT", `/api/channels/${board.slug}/access`, { allow: names(allow), deny: names(deny) });
      onSaved(r.board);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "couldn't save");
    }
  }
  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <form className="card dialog" onSubmit={save} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Who can join">
        <h2>Who can join #{board.slug}</h2>
        {board.visibility === "list" && (
          <label>
            Allowed usernames
            <input value={allow} onChange={(e) => setAllow(e.target.value)} autoFocus />
          </label>
        )}
        <label>
          Kept out <span className="hint">(removed now and can't rejoin)</span>
          <input value={deny} onChange={(e) => setDeny(e.target.value)} />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="row">
          <button className="primary" type="submit">
            Save
          </button>
          <button className="secondary" type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
