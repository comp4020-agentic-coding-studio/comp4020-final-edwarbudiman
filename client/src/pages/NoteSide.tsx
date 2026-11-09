import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { api, ApiError, COMMENT_MAX, SIDE_STATUS_NAMES } from "../api.ts";
import type { Note, SideComment, SideData, SideStatus } from "../api.ts";

// The note's back side: a right-hand sidebar (a bottom sheet on phones).
// Top to bottom: the note's text, Proof, Who's on it (all fixed), then the
// comments, the only part that scrolls, with the input pinned at the bottom.

type Person = NonNullable<SideData["people"]>[number];

const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60e3);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  if (m < 60 * 24) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 60 / 24)} d ago`;
};
const initials = (name: string) => name.split(/[\s_-]+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?";

const CIRCLE = 28;
const GAP = 4;
const PILL = 52; // room kept for the +N pill (it is wider than a circle, up to "+999")

/** One line of circles; whatever doesn't fit becomes +N at the end. */
function FitRow({ people, tip, onTip, onMore }: { people: Person[]; tip: string | null; onTip: (name: string) => void; onMore: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [cap, setCap] = useState(people.length);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const calc = () => {
      const room = (w: number) => Math.max(1, Math.floor((w + GAP) / (CIRCLE + GAP)));
      const all = room(el.clientWidth);
      setCap(people.length <= all ? people.length : room(el.clientWidth - PILL - GAP));
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(el);
    return () => ro.disconnect();
  }, [people.length]);
  return (
    <div className="ns-circles" ref={ref}>
      {people.slice(0, cap).map((p) => (
        <button key={p.name} type="button" className={`ns-dot s-${p.status}${tip === p.name ? " on" : ""}`} onClick={() => onTip(p.name)} aria-label={`${p.name}, ${SIDE_STATUS_NAMES[p.status]}, ${ago(p.at)}`}>
          {initials(p.name)}
        </button>
      ))}
      {people.length > cap && (
        <button type="button" className="ns-more" onClick={onMore} aria-label={`${people.length - cap} more`}>
          +{people.length - cap}
        </button>
      )}
    </div>
  );
}

export function NoteSide(props: {
  note: Note;
  me: string;
  /** Bumped each time the server says something on this note's back side changed. */
  tick: number;
  leaving: boolean;
  onSetStatus: (s: SideStatus | null) => void;
  onSetProof: (proof: boolean) => void;
  onClose: () => void;
  onFlash: (msg: string) => void;
}) {
  const { note } = props;
  const mine = note.author === props.me; // the creator: only they tick proof and see who is on it
  const [data, setData] = useState<SideData | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [tip, setTip] = useState<{ status: SideStatus; name: string } | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const listRef = useRef<HTMLUListElement>(null);
  const stick = useRef(true); // new comments scroll into view unless you've scrolled up to read

  // switching notes starts clean
  useEffect(() => {
    setData(null);
    setExpanded(false);
    setTip(null);
    setDraft("");
    setEditingId(null);
    stick.current = true;
  }, [note.id]);

  // load, and reload whenever the server says the back side changed
  useEffect(() => {
    let live = true;
    api<SideData>("GET", `/api/notes/${note.id}/side`)
      .then((d) => live && setData(d))
      .catch((err) => {
        if (live && err instanceof ApiError && err.status === 404) props.onClose();
      });
    return () => {
      live = false;
    };
  }, [note.id, props.tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const comments = data?.comments ?? [];
  useLayoutEffect(() => {
    const el = listRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight; // live-chat order: the newest sits at the bottom
  }, [note.id, comments.length, comments[comments.length - 1]?.id, !!data]);

  const done = data?.people?.filter((p) => p.status === "done") ?? [];
  const progress = data?.people?.filter((p) => p.status === "progress") ?? [];
  const counts = [note.doneCount ? `${note.doneCount} done` : "", note.progressCount ? `${note.progressCount} on progress` : ""].filter(Boolean).join(" · ");

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const r = await api<{ comment: SideComment }>("POST", `/api/notes/${note.id}/comments`, { text });
      stick.current = true;
      setData((d) => (d && !d.comments.some((c) => c.id === r.comment.id) ? { ...d, comments: [...d.comments, r.comment] } : d));
      setDraft("");
    } catch (err) {
      props.onFlash(err instanceof ApiError ? err.message : "couldn't send that comment");
    } finally {
      setSending(false);
    }
  }
  async function saveEdit(id: number) {
    const text = editText.trim();
    if (!text) return;
    try {
      const r = await api<{ comment: SideComment }>("PATCH", `/api/comments/${id}`, { text });
      setData((d) => (d ? { ...d, comments: d.comments.map((c) => (c.id === id ? r.comment : c)) } : d));
      setEditingId(null);
    } catch (err) {
      props.onFlash(err instanceof ApiError ? err.message : "couldn't save that comment");
    }
  }
  async function remove(id: number) {
    try {
      await api("DELETE", `/api/comments/${id}`);
      setData((d) => (d ? { ...d, comments: d.comments.filter((c) => c.id !== id) } : d));
    } catch (err) {
      props.onFlash(err instanceof ApiError ? err.message : "couldn't delete that comment");
    }
  }

  const row = (label: string, list: Person[]) => {
    if (list.length === 0) return null;
    const tipped = tip && list.find((p) => p.name === tip.name && p.status === tip.status);
    return (
      <div className="ns-group" key={label}>
        <div className="ns-glabel">
          {label} <span className="ns-muted">({list.length})</span>
        </div>
        <FitRow people={list} tip={tipped ? tipped.name : null} onTip={(name) => setTip(tip && tip.name === name && tip.status === list[0].status ? null : { name, status: list[0].status })} onMore={() => setExpanded(true)} />
        {tipped && (
          <p className="ns-tip">
            {tipped.name}, {ago(tipped.at)}
          </p>
        )}
      </div>
    );
  };

  return (
    <aside className={`note-side island${props.leaving ? " leaving" : ""}`} aria-label="Note details" onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === "Escape" && props.onClose()}>
      <header className="ns-head">
        <strong>Note details</strong>
        <button type="button" className="quiet" onClick={props.onClose} aria-label="Close">
          ×
        </button>
      </header>
      <p className="ns-quote" key={note.id}>
        {note.text || "Empty note"}
      </p>

      <section>
        <h4>Proof</h4>
        <label className={`ns-proof${mine ? "" : " ro"}`}>
          <input type="checkbox" checked={note.proof} disabled={!mine} onChange={(e) => props.onSetProof(e.target.checked)} />
          <span>{mine ? "I confirm the finish criteria are met" : note.proof ? `${note.author} confirmed it's finished` : `Only ${note.author} can confirm this`}</span>
        </label>
      </section>

      <section>
        <h4>Who's on it</h4>
        <div className="ns-mine">
          Your status:
          {(["progress", "done"] as SideStatus[]).map((s) => (
            <button key={s} type="button" className={`ns-st${note.myStatus === s ? " on" : ""}`} aria-pressed={note.myStatus === s} onClick={() => props.onSetStatus(note.myStatus === s ? null : s)}>
              {SIDE_STATUS_NAMES[s]}
            </button>
          ))}
        </div>
        {mine ? (
          done.length + progress.length === 0 ? (
            <p className="ns-muted">{data ? "Nobody has set a status yet." : " "}</p>
          ) : expanded ? (
            <>
              <div className="ns-scroll">
                {[
                  ["Done", done],
                  ["On progress", progress],
                ].map(([label, list]) =>
                  (list as Person[]).length === 0 ? null : (
                    <div className="ns-group" key={label as string}>
                      <div className="ns-glabel">
                        {label as string} <span className="ns-muted">({(list as Person[]).length})</span>
                      </div>
                      <ul className="ns-names">
                        {(list as Person[]).map((p) => (
                          <li key={p.name}>
                            <span className={`ns-dot s-${p.status}`}>{initials(p.name)}</span> <span className="ns-nm">{p.name}</span> <em>{ago(p.at)}</em>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ),
                )}
              </div>
              <button type="button" className="ns-link" onClick={() => setExpanded(false)}>
                Show less
              </button>
            </>
          ) : (
            <>
              {row("Done", done)}
              {row("On progress", progress)}
            </>
          )
        ) : (
          <p className="ns-muted">{counts || "No one has started it"}</p>
        )}
      </section>

      <section className="ns-comments">
        <h4>
          Comments {comments.length > 0 && <span className="ns-muted">({comments.length})</span>}
        </h4>
        <ul
          ref={listRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
          }}
        >
          <li className="ns-spacer" aria-hidden="true" />
          {comments.map((c) => (
            <li key={c.id}>
              <div className="ns-cmeta">
                <strong>{c.author}</strong> <em>{ago(c.createdAt)}</em>
                {c.updatedAt > c.createdAt && <em> · edited</em>}
              </div>
              {editingId === c.id ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void saveEdit(c.id);
                  }}
                >
                  <input autoFocus value={editText} maxLength={COMMENT_MAX} aria-label="Edit comment" onChange={(e) => setEditText(e.target.value)} onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), setEditingId(null))} />
                </form>
              ) : (
                <p>{c.text}</p>
              )}
              {(c.mine || c.canDelete) && editingId !== c.id && (
                <div className="ns-cact">
                  {c.mine && (
                    <button
                      type="button"
                      className="ns-link"
                      onClick={() => {
                        setEditingId(c.id);
                        setEditText(c.text);
                      }}
                    >
                      edit
                    </button>
                  )}
                  {c.canDelete && (
                    <button type="button" className="ns-link" onClick={() => void remove(c.id)}>
                      delete
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
        <form
          className="ns-form"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Write a comment" maxLength={COMMENT_MAX} aria-label="Write a comment" />
          <button type="submit" disabled={sending || !draft.trim()}>
            Send
          </button>
        </form>
      </section>
    </aside>
  );
}
