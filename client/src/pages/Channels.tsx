import { useCallback, useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { api, ApiError, boardPath } from "../api.ts";
import type { BoardInfo, ChannelSummary, SidebarChannel, SidebarPerson } from "../api.ts";
import { Link, navigate, usePath, useSession } from "../router.tsx";
import { onOpenCreateChannel, onRefreshSidebar, refreshSidebar } from "../shell.ts";

// The sidebar, Discord-style but flat: the channels you're in and the people
// whose boards you've visited, alphabetical by default (or sorted by activity
// or unread), each with a count of notes that are new to you. You sit at the
// bottom: your board, settings and log out. New channels are made through a
// proper form; channels you're not in yet are found under "Browse".

const names = (s: string) =>
  s
    .split(/[\s,]+/)
    .map((x) => x.trim())
    .filter(Boolean);

/** Same rule as the server's, so the address preview is the address you get. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* private window: the setting just doesn't stick */
    }
  },
};

function Dialog(props: { label: string; onClose: () => void; children: ReactNode; onSubmit?: (e: FormEvent) => void; wide?: boolean }) {
  return (
    <div className="dialog-backdrop" onPointerDown={props.onClose}>
      <form
        className={`island dialog${props.wide ? " wide" : ""}`}
        role="dialog"
        aria-label={props.label}
        onSubmit={props.onSubmit ?? ((e) => e.preventDefault())}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === "Escape" && props.onClose()}
      >
        <div className="dialog-head">
          <h2>{props.label}</h2>
          <button type="button" className="tool" onClick={props.onClose} aria-label="Close">
            ×
          </button>
        </div>
        {props.children}
      </form>
    </div>
  );
}

const Unread = ({ n }: { n: number }) =>
  n > 0 ? (
    <span className="unread" aria-label={`${n} new note${n === 1 ? "" : "s"}`}>
      {n > 99 ? "99+" : n}
    </span>
  ) : null;

// ---------------------------------------------------------------- sidebar

type Sort = "az" | "active" | "unread";
const SORTS: [Sort, string][] = [
  ["az", "A–Z"],
  ["active", "Active"],
  ["unread", "Unread"],
];
const SIDEBAR_KEY = "sidebar:open";
const SORT_KEY = "sidebar:sort";

/** The board's frame: the sidebar beside the main column. Its toggle lives in
 *  the main column's corner, so it stays put whether the sidebar is open or not. */
export function Shell({ children }: { children: ReactNode }) {
  const { me, setMe } = useSession();
  const path = usePath();
  const [open, setOpen] = useState(() => store.get(SIDEBAR_KEY) !== "no" && window.innerWidth > 640);
  const [channels, setChannels] = useState<SidebarChannel[] | null>(null);
  const [people, setPeople] = useState<SidebarPerson[]>([]);
  const [sort, setSort] = useState<Sort>(() => (store.get(SORT_KEY) as Sort | null) ?? "az");
  const [creating, setCreating] = useState<string | null>(null);
  const [browsing, setBrowsing] = useState(false);
  const [youOpen, setYouOpen] = useState(false);

  const load = useCallback(() => {
    api<{ channels: SidebarChannel[]; people: SidebarPerson[] }>("GET", "/api/sidebar")
      .then((r) => {
        setChannels(r.channels);
        setPeople(r.people);
      })
      .catch(() => {});
  }, []);

  // reload when you move between boards (opening one marks it seen), when the
  // board says something changed, and every so often as a fallback
  useEffect(load, [load, path]);
  useEffect(() => onRefreshSidebar(load), [load]);
  useEffect(() => {
    const t = window.setInterval(() => document.visibilityState === "visible" && load(), 60_000);
    return () => window.clearInterval(t);
  }, [load]);
  useEffect(() => onOpenCreateChannel((slug) => setCreating(slug)), []);
  useEffect(() => store.set(SIDEBAR_KEY, open ? "yes" : "no"), [open]);
  useEffect(() => store.set(SORT_KEY, sort), [sort]);

  // the tab title carries the total, so a backgrounded tab shows there's news
  const total = (channels ?? []).reduce((s, c) => s + c.unread, 0) + people.reduce((s, p) => s + p.unread, 0);
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\+?\) /, "");
    document.title = total ? `(${total > 99 ? "99+" : total}) ${base}` : base;
  }, [total, path]);

  const order = <T extends { unread: number; activeAt: number }>(key: (x: T) => string) => (a: T, b: T) => {
    if (sort === "unread" && (a.unread > 0) !== (b.unread > 0)) return a.unread > 0 ? -1 : 1;
    if (sort === "active" && a.activeAt !== b.activeAt) return b.activeAt - a.activeAt;
    return key(a).localeCompare(key(b));
  };
  const shownChannels = [...(channels ?? [])].sort(order((c) => c.slug));
  const mine = people.find((p) => p.username === me.username);
  const shownPeople = people.filter((p) => p.username !== me.username).sort(order((p) => p.username));
  const here = (to: string) => decodeURIComponent(path.replace(/\/$/, "") || "/").toLowerCase() === to.toLowerCase();

  async function leave(c: SidebarChannel) {
    try {
      await api("POST", `/api/channels/${encodeURIComponent(c.slug)}/leave`);
      if (here(boardPath("channel", c.slug))) navigate("/");
      load();
    } catch {
      /* the row stays; nothing else to do */
    }
  }
  async function forget(p: SidebarPerson) {
    await api("DELETE", `/api/sidebar/people/${encodeURIComponent(p.username)}`).catch(() => {});
    load();
  }
  async function logout() {
    await api("POST", "/api/logout").catch(() => {});
    history.replaceState(null, "", "/");
    setMe(null);
  }

  return (
    <div className="shell">
      {open && (
        <nav id="sidebar" className="sidebar" aria-label="Channels and people">
          <div className="sidebar-head">
            <span className="sidebar-brand">Post-its</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort channels and people" title="Sort">
              {SORTS.map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="sidebar-scroll">
            <div className="side-head">
              <span>Channels</span>
              <span className="side-head-actions">
                <button className="tool sm" onClick={() => setBrowsing(true)} title="Browse channels">
                  <svg viewBox="0 0 20 20" aria-hidden>
                    <path d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM13 13l3.5 3.5" />
                  </svg>
                  <span className="sr-only">Browse channels</span>
                </button>
                <button className="tool sm" onClick={() => setCreating("")} title="Create a channel">
                  <svg viewBox="0 0 20 20" aria-hidden>
                    <path d="M10 4.5v11M4.5 10h11" />
                  </svg>
                  <span className="sr-only">Create a channel</span>
                </button>
              </span>
            </div>
            {channels === null && <p className="side-note">Loading…</p>}
            {channels?.length === 0 && (
              <p className="side-note">
                You're not in any channels.{" "}
                <button className="link" onClick={() => setBrowsing(true)}>
                  Browse
                </button>{" "}
                or{" "}
                <button className="link" onClick={() => setCreating("")}>
                  create one
                </button>
                .
              </p>
            )}
            {shownChannels.map((c) => (
              <div key={c.slug} className={`side-row${here(boardPath("channel", c.slug)) ? " on" : ""}${c.unread ? " has-unread" : ""}`}>
                <Link to={boardPath("channel", c.slug)} className="side-link" title={c.description || c.name}>
                  <span className="hash" aria-hidden>
                    {c.visibility === "public" ? "#" : <LockIcon />}
                  </span>
                  <span className="side-name">{c.slug}</span>
                </Link>
                <Unread n={c.unread} />
                {!c.isOwner && (
                  <button className="side-x" onClick={() => void leave(c)} title={`Leave #${c.slug}`} aria-label={`Leave #${c.slug}`}>
                    ×
                  </button>
                )}
              </div>
            ))}

            <div className="side-head">
              <span>People</span>
            </div>
            {shownPeople.length === 0 && <p className="side-note">Boards you visit show up here.</p>}
            {shownPeople.map((p) => (
              <div key={p.username} className={`side-row${here(boardPath("user", p.username, me.username)) ? " on" : ""}${p.unread ? " has-unread" : ""}`}>
                <Link to={boardPath("user", p.username, me.username)} className="side-link">
                  <span className="avatar sm" aria-hidden>
                    {p.username[0].toUpperCase()}
                  </span>
                  <span className="side-name">{p.username}</span>
                </Link>
                <Unread n={p.unread} />
                <button className="side-x" onClick={() => void forget(p)} title={`Remove ${p.username} from the sidebar`} aria-label={`Remove ${p.username}`}>
                  ×
                </button>
              </div>
            ))}
          </div>

          <div className="menu you">
            <button
              className={`you-button${here("/") ? " on" : ""}${mine?.unread ? " has-unread" : ""}`}
              aria-expanded={youOpen}
              aria-haspopup="menu"
              onClick={() => setYouOpen((o) => !o)}
              title="Your board, settings, log out"
            >
              <span className="avatar" aria-hidden>
                {me.username[0].toUpperCase()}
              </span>
              <span className="you-name">
                <strong>{me.username}</strong>
                <span className="muted">{me.anonymous ? "Anonymous cursor" : "Signed in"}</span>
              </span>
              <Unread n={mine?.unread ?? 0} />
            </button>
            {youOpen && (
              <>
                <div className="menu-backdrop" onPointerDown={() => setYouOpen(false)} />
                <div className="island menu-pop above" role="menu" onKeyDown={(e) => e.key === "Escape" && setYouOpen(false)}>
                  <Link to="/" className="menu-item" onNavigate={() => setYouOpen(false)}>
                    Your board
                    <Unread n={mine?.unread ?? 0} />
                  </Link>
                  <Link to="/settings" className="menu-item">
                    Settings
                  </Link>
                  <button role="menuitem" className="danger-text" onClick={logout}>
                    Log out
                  </button>
                </div>
              </>
            )}
          </div>
        </nav>
      )}

      <div className="shell-main">
        <button
          className="island tool sidebar-toggle"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="sidebar"
          title={open ? "Hide the sidebar" : "Show channels and people"}
        >
          <svg viewBox="0 0 20 20" aria-hidden>
            <path d="M3.5 4.5h13v11h-13Z M8 4.5v11" />
            {open && <path className="pane" d="M3.5 4.5H8v11H3.5Z" />}
          </svg>
          <span className="sr-only">Channels and people</span>
          {!open && total > 0 && <span className="dot" aria-hidden />}
        </button>
        {children}
      </div>

      {creating !== null && (
        <CreateChannelDialog
          initial={creating}
          onClose={() => setCreating(null)}
          onCreated={(slug) => {
            setCreating(null);
            refreshSidebar();
            navigate(boardPath("channel", slug));
          }}
        />
      )}
      {browsing && (
        <BrowseDialog
          onClose={() => setBrowsing(false)}
          onCreate={(slug) => {
            setBrowsing(false);
            setCreating(slug);
          }}
        />
      )}
    </div>
  );
}

const LockIcon = () => (
  <svg className="lock" viewBox="0 0 20 20" aria-label="private">
    <path d="M6 9V7a4 4 0 0 1 8 0v2M5 9h10v7.5H5Z" />
  </svg>
);

// ---------------------------------------------------------------- create

type Visibility = "public" | "key" | "list";
const WHO: [Visibility, string, string][] = [
  ["public", "Anyone", "Everyone signed in can find it in Browse and walk in."],
  ["key", "With a key", "Listed in Browse, but joining needs a key you share."],
  ["list", "Invite-only", "Only the usernames you list can join."],
];

function CreateChannelDialog({ initial, onClose, onCreated }: { initial: string; onClose: () => void; onCreated: (slug: string) => void }) {
  const [name, setName] = useState(initial.replace(/-/g, " "));
  const [slug, setSlug] = useState(initial);
  const [slugTouched, setSlugTouched] = useState(!!initial);
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [key, setKey] = useState("");
  const [allow, setAllow] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const address = slugTouched ? slugify(slug) : slugify(name);
  const ready = name.trim().length > 0 && address.length >= 2 && (visibility !== "key" || key.length >= 4);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setError(null);
    setBusy(true);
    try {
      const r = await api<{ board: BoardInfo }>("POST", "/api/channels", {
        name: name.trim(),
        slug: address,
        description,
        visibility,
        key: visibility === "key" ? key : undefined,
        allow: visibility === "list" ? names(allow) : [],
      });
      onCreated(r.board.slug);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "couldn't create the channel");
      setBusy(false);
    }
  }

  return (
    <Dialog label="Create a channel" onClose={onClose} onSubmit={submit}>
      <p className="hint">A channel is a shared board: everyone in it can add, move and edit any note. You'll be its owner.</p>

      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required autoFocus placeholder="e.g. Study group" />
      </label>
      <label>
        Address
        <span className="prefixed">
          <span className="prefix">/c/</span>
          <input
            value={address}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value);
            }}
            maxLength={32}
            spellCheck={false}
            aria-describedby="address-hint"
          />
        </span>
        <span id="address-hint" className="hint below">
          2–32 letters, numbers or dashes. It can't be changed later.
        </span>
      </label>
      <label>
        Description <span className="optional">(optional)</span>
        <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={140} placeholder="What's this channel for?" />
      </label>

      <div className="choice-list" role="radiogroup" aria-label="Who can join">
        <p className="field-label">Who can join</p>
        {WHO.map(([v, title, desc]) => (
          <label key={v} className={`choice${visibility === v ? " on" : ""}`}>
            <input type="radio" name="vis" checked={visibility === v} onChange={() => setVisibility(v)} />
            <span>
              <strong>{title}</strong>
              <span className="muted">{desc}</span>
            </span>
          </label>
        ))}
      </div>
      {visibility === "key" && (
        <label>
          Key <span className="hint">(4+ characters; share it yourself)</span>
          <input type="password" autoComplete="new-password" value={key} onChange={(e) => setKey(e.target.value)} minLength={4} required />
        </label>
      )}
      {visibility === "list" && (
        <label>
          Who's invited <span className="hint">(usernames, comma or space separated)</span>
          <input value={allow} onChange={(e) => setAllow(e.target.value)} />
        </label>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="dialog-actions">
        <button type="button" className="quiet" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="primary" disabled={busy || !ready}>
          {busy ? "Creating…" : "Create channel"}
        </button>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------- browse

type BrowseSort = "az" | "members";

function BrowseDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (slug: string) => void }) {
  const [channels, setChannels] = useState<ChannelSummary[] | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<BrowseSort>("az");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<{ channels: ChannelSummary[] }>("GET", "/api/channels")
      .then((r) => setChannels(r.channels))
      .catch((e) => setError(e instanceof Error ? e.message : "couldn't load channels"));
  }, []);
  const q = query.trim().toLowerCase().replace(/^#/, "");
  const shown = (channels ?? [])
    .filter((c) => !q || c.slug.includes(q) || c.name.toLowerCase().includes(q))
    .sort((a, b) => (sort === "members" && a.members !== b.members ? b.members - a.members : a.slug.localeCompare(b.slug)));
  const wanted = slugify(q);
  const missing = wanted.length >= 2 && !(channels ?? []).some((c) => c.slug === wanted);

  return (
    <Dialog label="Browse channels" onClose={onClose} wide>
      <div className="sidebar-tools">
        <input type="search" autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search channels" aria-label="Search channels" />
        <select value={sort} onChange={(e) => setSort(e.target.value as BrowseSort)} aria-label="Sort">
          <option value="az">A–Z</option>
          <option value="members">Most members</option>
        </select>
      </div>
      {error && <p className="error">{error}</p>}
      <ul className="browse-list">
        {channels === null && !error && <li className="side-note">Loading…</li>}
        {shown.map((c) => (
          <li key={c.slug}>
            <Link to={boardPath("channel", c.slug)} className="browse-row" onNavigate={onClose}>
              <span className="browse-main">
                <strong>
                  <span className="hash">#</span>
                  {c.slug}
                </strong>
                {c.name.toLowerCase() !== c.slug.replace(/-/g, " ") && <span className="muted"> {c.name}</span>}
              </span>
              <span className="channel-meta">
                {c.visibility === "key" && <span className="chip">key</span>}
                {c.visibility === "list" && <span className="chip">invite-only</span>}
                <span className="muted small">
                  {c.members} member{c.members === 1 ? "" : "s"}
                </span>
                <span className={`browse-action${c.member ? " joined" : ""}`}>{c.member ? "Joined" : "View"}</span>
              </span>
            </Link>
          </li>
        ))}
        {channels !== null && shown.length === 0 && <li className="side-note">{q ? `No channel matches “${query.trim()}”.` : "No channels yet."}</li>}
      </ul>
      {missing && (
        <button type="button" className="label-add" onClick={() => onCreate(wanted)}>
          + Create #{wanted}
        </button>
      )}
    </Dialog>
  );
}

// ---------------------------------------------------------------- settings

export function ChannelSettingsDialog({ board, onClose, onSaved }: { board: BoardInfo; onClose: () => void; onSaved: (b: BoardInfo) => void }) {
  const [name, setName] = useState(board.name);
  const [description, setDescription] = useState(board.description ?? "");
  const [visibility, setVisibility] = useState<Visibility>(board.visibility);
  const [key, setKey] = useState("");
  const [allow, setAllow] = useState((board.access?.allow ?? []).join(", "));
  const [deny, setDeny] = useState((board.access?.deny ?? []).join(", "));
  const [error, setError] = useState<string | null>(null);
  const hasKey = board.visibility === "key";
  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const r = await api<{ board: BoardInfo }>("PUT", `/api/channels/${encodeURIComponent(board.slug)}/access`, {
        name: name.trim(),
        description,
        visibility,
        key: visibility === "key" && key ? key : undefined,
        allow: names(allow),
        deny: names(deny),
      });
      onSaved(r.board);
      refreshSidebar();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "couldn't save");
    }
  }
  return (
    <Dialog label={`#${board.slug} settings`} onClose={onClose} onSubmit={save}>
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required />
      </label>
      <label>
        Description <span className="optional">(optional)</span>
        <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={140} />
      </label>
      <div className="choice-list" role="radiogroup" aria-label="Who can join">
        <p className="field-label">Who can join</p>
        {WHO.map(([v, title, desc]) => (
          <label key={v} className={`choice${visibility === v ? " on" : ""}`}>
            <input type="radio" name="vis" checked={visibility === v} onChange={() => setVisibility(v)} />
            <span>
              <strong>{title}</strong>
              <span className="muted">{desc}</span>
            </span>
          </label>
        ))}
      </div>
      {visibility === "key" && (
        <label>
          {hasKey ? "New key" : "Key"} <span className="hint">{hasKey ? "(leave blank to keep the current one)" : "(4+ characters; share it yourself)"}</span>
          <input type="password" autoComplete="new-password" value={key} onChange={(e) => setKey(e.target.value)} minLength={4} required={!hasKey} />
        </label>
      )}
      {visibility === "list" && (
        <label>
          Who's invited <span className="hint">(usernames, comma or space separated)</span>
          <input value={allow} onChange={(e) => setAllow(e.target.value)} />
        </label>
      )}
      <label>
        Kept out <span className="hint">(removed now, and can't rejoin)</span>
        <input value={deny} onChange={(e) => setDeny(e.target.value)} />
      </label>
      <p className="hint">People already in stay in when you change who can join, unless you keep them out.</p>
      {error && <p className="error">{error}</p>}
      <div className="dialog-actions">
        <button type="button" className="quiet" onClick={onClose}>
          Cancel
        </button>
        <button className="primary" type="submit">
          Save
        </button>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------- gate

/** Shown on the canvas when you open a channel you're not in yet. */
export function JoinCard({ slug, gate, onJoined }: { slug: string; gate: { visibility: string; message: string }; onJoined: () => void }) {
  const { me } = useSession();
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api("POST", `/api/channels/${encodeURIComponent(slug)}/join`, { key });
      refreshSidebar();
      onJoined();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "couldn't join");
    }
  }
  const back = (
    <Link to={boardPath("user", me.username, me.username)} className="button quiet">
      Back to your board
    </Link>
  );
  return (
    <div className="gate">
      {gate.visibility === "key" ? (
        <form className="island gate-card" onSubmit={submit}>
          <h2>
            <span className="hash">#</span>
            {slug}
          </h2>
          <p className="muted">This channel needs a key. Ask whoever made it; you'll only enter it once.</p>
          <label>
            Key
            <input type="password" value={key} onChange={(e) => setKey(e.target.value)} autoFocus autoComplete="off" required />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="dialog-actions">
            {back}
            <button className="primary" type="submit">
              Join
            </button>
          </div>
        </form>
      ) : (
        <div className="island gate-card">
          <h2>
            <span className="hash">#</span>
            {slug}
          </h2>
          <p className="muted">{gate.visibility === "list" ? "This channel is invite-only. Ask whoever made it to add your username." : gate.message}</p>
          <div className="dialog-actions">{back}</div>
        </div>
      )}
    </div>
  );
}

/** A channel address nobody has used yet: offer the form instead of making it silently. */
export function MissingChannel({ slug, onCreate }: { slug: string; onCreate: () => void }) {
  const { me } = useSession();
  return (
    <div className="gate">
      <div className="island gate-card">
        <h2>
          <span className="hash">#</span>
          {slug}
        </h2>
        <p className="muted">There's no channel at this address yet.</p>
        <div className="dialog-actions">
          <Link to={boardPath("user", me.username, me.username)} className="button quiet">
            Back to your board
          </Link>
          <button className="primary" onClick={onCreate}>
            Create #{slugify(slug)}
          </button>
        </div>
      </div>
    </div>
  );
}
