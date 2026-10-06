import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { ServerMsg } from "../socket.ts";

// Channel chat, held by the people in the room rather than the server.
// The server signs each line and forgets it; this tab keeps the lines it has
// seen (in memory only) and, when someone new arrives and the server asks,
// hands them over. Close the tab and this copy is gone.

interface Line {
  id: string;
  author: string;
  ts: number;
  text: string;
  sig: string;
}

const HISTORY_CAP = 200;
const SHARE_KEY = "chat:share-history";

function merge(a: Line[], b: Line[]): Line[] {
  const byId = new Map<string, Line>();
  for (const l of [...a, ...b]) byId.set(l.id, l);
  return [...byId.values()].sort((x, y) => x.ts - y.ts).slice(-HISTORY_CAP);
}

export function Chat(props: {
  open: boolean;
  onToggle: () => void;
  register: (h: (m: ServerMsg) => void) => void;
  send: (m: Record<string, unknown>) => void;
  live: boolean;
  me: string;
}) {
  const [lines, setLines] = useState<Line[]>([]);
  const [waiting, setWaiting] = useState(true);
  const [text, setText] = useState("");
  const [unread, setUnread] = useState(0);
  // F-01: sharing what you hold with newcomers is a choice; on by default
  const [share, setShare] = useState(() => localStorage.getItem(SHARE_KEY) !== "no");
  const linesRef = useRef(lines);
  const shareRef = useRef(share);
  const listRef = useRef<HTMLOListElement>(null);
  linesRef.current = lines;
  shareRef.current = share;

  useEffect(() => {
    props.register((m) => {
      if (m.type === "chat:msg") {
        setLines((prev) => merge(prev, [m.line as Line]));
        setUnread((u) => u + 1);
      } else if (m.type === "chat:history") {
        setLines((prev) => merge(prev, (m.lines as Line[]) ?? []));
        setWaiting(false);
      } else if (m.type === "chat:history:request") {
        if (shareRef.current) props.send({ type: "chat:history:reply", to: m.to, lines: linesRef.current.slice(-HISTORY_CAP) });
        else props.send({ type: "chat:history:reply", to: m.to, declined: true });
      }
    });
    return () => props.register(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    localStorage.setItem(SHARE_KEY, share ? "yes" : "no");
  }, [share]);

  useEffect(() => {
    if (props.open) setUnread(0);
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines, props.open]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t || !props.live) return;
    props.send({ type: "chat:send", text: t });
    setText("");
  }

  const time = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <aside className={`chat${props.open ? " open" : ""}`} aria-label="Channel chat">
      <button className="chat-toggle" onClick={props.onToggle} aria-expanded={props.open}>
        Chat{unread > 0 && !props.open ? ` (${unread})` : ""}
      </button>
      <div className="chat-body">
        <header>
          <h2>Chat</h2>
          <p className="hint">Not stored anywhere. A message lasts as long as someone who saw it is still here.</p>
        </header>
        <ol ref={listRef} className="chat-lines" aria-live="polite">
          {waiting && <li className="muted small">Asking who's here for what they've seen…</li>}
          {!waiting && lines.length === 0 && <li className="muted small">Nothing said yet — or everyone who saw it has left.</li>}
          {lines.map((l) => (
            <li key={l.id} className={l.author === props.me ? "mine" : ""}>
              <span className="chat-meta">
                <strong>{l.author}</strong> <time>{time(l.ts)}</time>
              </span>
              <span className="chat-text">{l.text}</span>
            </li>
          ))}
        </ol>
        <form onSubmit={submit} className="chat-form">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={500}
            placeholder={props.live ? "Say something…" : "Reconnecting…"}
            aria-label="Message"
            disabled={!props.live}
          />
          <button className="primary" type="submit" disabled={!props.live || !text.trim()}>
            Send
          </button>
        </form>
        <label className="share">
          <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} /> Share what I've seen with people who join after me
        </label>
      </div>
    </aside>
  );
}
