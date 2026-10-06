// One structured JSON line per user action (C10-01): who, what, when, where.
// Never the text of a note or a chat line, never a password, key or token —
// callers only pass ids, names and enums.

type Fields = Record<string, string | number | boolean | null | undefined>;

const recent: { ts: number; action: string }[] = [];
const HOUR = 60 * 60 * 1000;

export function logAction(user: string | null, action: string, fields: Fields = {}): void {
  const ts = Date.now();
  recent.push({ ts, action });
  while (recent.length > 0 && recent[0].ts < ts - HOUR) recent.shift();
  if (recent.length > 50_000) recent.splice(0, recent.length - 50_000);
  if (process.env.LOG_ACTIONS === "0") return;
  console.log(JSON.stringify({ ts: new Date(ts).toISOString(), kind: "action", user, action, ...fields }));
}

export function logEvent(event: string, fields: Fields = {}): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), kind: "event", event, ...fields }));
}

/** Count of each action in the last hour, for the stats page (C10-02). */
export function recentActionCounts(): Record<string, number> {
  const since = Date.now() - HOUR;
  const counts: Record<string, number> = {};
  for (const r of recent) if (r.ts >= since) counts[r.action] = (counts[r.action] ?? 0) + 1;
  return counts;
}
