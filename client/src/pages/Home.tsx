import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api, ApiError } from "../api.ts";
import type { BoardInfo, ChannelSummary } from "../api.ts";
import { Link, navigate, useSession } from "../router.tsx";
import { Header } from "./Header.tsx";

export function Home() {
  const { me } = useSession();
  const [users, setUsers] = useState<string[] | null>(null);
  const [channels, setChannels] = useState<ChannelSummary[] | null>(null);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ users: { username: string }[] }>("GET", "/api/users")
      .then((r) => setUsers(r.users.map((u) => u.username)))
      .catch((e) => setError(e.message));
    api<{ channels: ChannelSummary[] }>("GET", "/api/channels")
      .then((r) => setChannels(r.channels))
      .catch((e) => setError(e.message));
  }, []);

  const shown = (users ?? []).filter((u) => u.includes(filter.trim().toLowerCase()));

  return (
    <>
      <Header />
      <main className="page home">
        {error && <p className="error">{error}</p>}
        <section className="hero">
          <h1>Hi, {me.username}</h1>
          <p>
            Your board is where your notes live, arranged however you like. Visit someone's board to leave them a note, or meet in a channel.
          </p>
          <Link to="/" className="button primary">
            Open my board
          </Link>
        </section>

        <section aria-labelledby="people-h">
          <div className="section-head">
            <h2 id="people-h">People</h2>
            <input type="search" placeholder="Find someone…" aria-label="Find someone" value={filter} onChange={(e) => setFilter(e.target.value)} />
          </div>
          {users === null ? (
            <p className="muted">Loading…</p>
          ) : (
            <ul className="directory">
              {shown.map((u) => (
                <li key={u}>
                  <Link to={`/${u}`} title={`Go to ${u}'s board`}>
                    <span className="avatar" aria-hidden>
                      {u[0].toUpperCase()}
                    </span>
                    {u}
                    {u === me.username && <span className="you"> (you)</span>}
                  </Link>
                </li>
              ))}
              {shown.length === 0 && <li className="muted">Nobody by that name.</li>}
            </ul>
          )}
        </section>

        <section aria-labelledby="channels-h">
          <div className="section-head">
            <h2 id="channels-h">Channels</h2>
          </div>
          {channels === null ? (
            <p className="muted">Loading…</p>
          ) : (
            <ul className="channels">
              {channels.map((c) => (
                <li key={c.slug}>
                  <Link to={`/c/${c.slug}`}>
                    <strong>#{c.slug}</strong> <span className="muted">{c.name}</span>
                  </Link>
                  <span className="tags">
                    {c.visibility === "key" && <span className="tag">key</span>}
                    {c.visibility === "list" && <span className="tag">invite-only</span>}
                    {c.member && <span className="tag member">member</span>}
                    <span className="muted small">
                      {c.members} member{c.members === 1 ? "" : "s"}
                    </span>
                  </span>
                </li>
              ))}
              {channels.length === 0 && <li className="muted">No channels yet.</li>}
            </ul>
          )}
          <NewChannel />
        </section>
      </main>
    </>
  );
}

function NewChannel() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState<"public" | "key" | "list">("public");
  const [key, setKey] = useState("");
  const [allow, setAllow] = useState("");
  const [deny, setDeny] = useState("");
  const [error, setError] = useState<string | null>(null);

  const names = (s: string) =>
    s
      .split(/[\s,]+/)
      .map((x) => x.trim())
      .filter(Boolean);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const r = await api<{ board: BoardInfo }>("POST", "/api/channels", {
        name,
        visibility,
        key: visibility === "key" ? key : undefined,
        allow: visibility === "list" ? names(allow) : [],
        deny: names(deny),
      });
      navigate(`/c/${r.board.slug}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "couldn't create the channel");
    }
  }

  if (!open)
    return (
      <button className="secondary" onClick={() => setOpen(true)}>
        + New channel
      </button>
    );

  return (
    <form className="card new-channel" onSubmit={submit}>
      <h3>New channel</h3>
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required autoFocus />
      </label>
      <fieldset>
        <legend>Who can join</legend>
        <label className="radio">
          <input type="radio" name="vis" checked={visibility === "public"} onChange={() => setVisibility("public")} /> Anyone logged in
        </label>
        <label className="radio">
          <input type="radio" name="vis" checked={visibility === "key"} onChange={() => setVisibility("key")} /> Anyone with the key
        </label>
        <label className="radio">
          <input type="radio" name="vis" checked={visibility === "list"} onChange={() => setVisibility("list")} /> Only people I list
        </label>
      </fieldset>
      {visibility === "key" && (
        <label>
          Key <span className="hint">(at least 4 characters; share it yourself)</span>
          <input type="password" autoComplete="new-password" value={key} onChange={(e) => setKey(e.target.value)} minLength={4} required />
        </label>
      )}
      {visibility === "list" && (
        <label>
          Allowed usernames <span className="hint">(comma or space separated)</span>
          <input value={allow} onChange={(e) => setAllow(e.target.value)} />
        </label>
      )}
      <label>
        Keep out <span className="hint">(usernames that can never join)</span>
        <input value={deny} onChange={(e) => setDeny(e.target.value)} />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="row">
        <button type="submit" className="primary">
          Create
        </button>
        <button type="button" className="secondary" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
