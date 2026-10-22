# ADR-0001: Read-only MCP triage server (checkpoint F)

Status: proposed. Not implemented. No code changes ship with this ADR.

## Problem

Post-its' own board gives a human everything they need to triage their
notes by eye: position, colour, and (once checkpoint E lands) a
`todo → doing → done` status. We want a user's own agent — Claude Desktop,
Claude Code, any MCP client they already run — to be able to read that same
board and suggest triage ("these three are stale", "nothing's `doing`
right now"), without us hosting any inference ourselves and without
weakening the session-cookie auth that already protects private notes.

Three existing things the design must not re-decide:

- **Auth today** (`server/src/auth.ts`) is a single path: a `sid` cookie
  resolves to a `sessions` row, which resolves to a `User`. Every downstream
  function — `canSee`, `canEdit`, `userBoard`, `channelBoard` in
  `server/src/boards.ts` — takes that `User`, never the cookie itself. That
  indirection is the seam this design plugs into.
- **Visibility is already correct and non-trivial**: a note is visible to
  the viewer "if public, or you wrote it, or you own the board"
  (`boards.ts:89`); a channel board additionally gates on membership and
  the board's `public` / `key` / `list` visibility. Reimplementing any of
  this for the agent surface would create two places that decide what a
  user can see — the project's own `design-red-flags.md` names this
  "split ownership," and it is the single easiest way to leak a private
  note to the wrong agent.
- **The deploy target is one 256 MB Fly machine** that auto-stops when
  idle (`fly.toml`). A second always-on process competes for that memory
  budget for no benefit, since the existing process already holds the
  open SQLite handle.

## Usage (caller's view)

A user generates a token once, in Settings:

```
POST /api/me/tokens  { "label": "claude-desktop" }
→ 201 { "token": "pit_8f2a...  (shown once, never again)", "id": 7 }
```

They paste it into their own agent's MCP config, pointed at their own
deployed Post-its instance — nothing runs locally, nothing we host costs us
inference:

```json
{
  "mcpServers": {
    "postits": {
      "url": "https://edward.fly.dev/mcp",
      "headers": { "Authorization": "Bearer pit_8f2a..." }
    }
  }
}
```

Their agent then calls, over MCP's Streamable HTTP transport:

```
tool: get_board_summary
args: {}
→ { board: "edward", totalNotes: 14,
    byStatus: { todo: 6, doing: 2, done: 5, approved: 1 },
    oldestUntouched: [{ id: 41, preview: "renew domain", status: "todo",
                         ageDays: 19, updatedAt: "2026-10-03T.." }, ...],
    lastActivityAt: "2026-10-20T.." }

tool: find_stale_notes
args: { olderThanDays: 14 }
→ { notes: [{ id: 41, preview: "renew domain", status: "todo",
              ageDays: 19, label: null }, ...] }

tool: list_notes
args: { status: "doing", board: "mine" }
→ { notes: [{ id: 52, preview: "finish ADR", status: "doing",
              label: "writing", ageDays: 1, updatedAt: ".." }] }
```

Revoking is the same shape as everything else self-serve in this app:

```
DELETE /api/me/tokens/7
→ 200 { ok: true }   # next call with that token gets 401 immediately
```

No tool ever takes an arbitrary board ID. `board` is either omitted
(defaults to the token owner's own board) or a username/channel slug the
*existing* visibility rules already let that user see — the agent can never
ask for a board the human couldn't open in their own browser.

## Shape

**Token auth resolves to the same `User`, nothing downstream changes.**

New table, same pattern as `sessions`:

```sql
CREATE TABLE agent_tokens (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  label       TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  last_used_at INTEGER,
  revoked_at  INTEGER
);
```

```ts
// server/src/auth.ts — new, sits beside sessionUser/startSession

/** A bearer token's owning user, or null if missing/unknown/revoked. */
export function agentTokenUser(db: DB, req: IncomingMessage): User | null {
  // not implemented: parse "Authorization: Bearer <token>", sha256 it,
  // look up agent_tokens WHERE token_hash = ? AND revoked_at IS NULL,
  // touch last_used_at, join to users, return the same User shape
  // sessionUser returns. On any miss, return null — never throw, so a
  // caller can fall through to cookie auth in the same request path.
}

export function generateAgentToken(db: DB, user: User, label: string): { id: number; token: string } {
  // not implemented: revokes the user's existing token first (MVP is one
  // token per user — `UPDATE agent_tokens SET revoked_at = ? WHERE
  // user_id = ? AND revoked_at IS NULL`), then randomBytes(32) base64url,
  // sha256 for storage, INSERT, return the *raw* token once. Mirrors
  // startSession's shape, but the raw value is returned to the caller
  // instead of set as a cookie — the caller (Settings page) displays it
  // once and never refetches it, because only the hash is stored.
  // `label` is kept (not dropped) even though MVP shows at most one row,
  // so letting a user hold several labelled tokens later only means
  // dropping the revoke-existing-first line, not a schema change.
}

export function revokeAgentToken(db: DB, user: User, tokenId: number): void {
  // not implemented: UPDATE agent_tokens SET revoked_at = ? WHERE id = ?
  // AND user_id = ? — the ownership check is the only thing standing
  // between "revoke my own token" and "revoke anyone's token by guessing
  // an id", so it is not optional.
}

export function currentAgentToken(db: DB, user: User): { id: number; label: string; createdAt: number; lastUsedAt: number | null } | null {
  // not implemented: the user's one active (non-revoked) token row, or
  // null. Never returns token_hash. Named for MVP's one-token shape;
  // becomes listAgentTokens (plural) the day a second token is allowed,
  // at which point this function's body becomes `.at(0)` over that list.
}
```

```ts
// server/src/http.ts — one new function, used at the top of every
// agent-surface route and nowhere else

/** Cookie session OR bearer token, whichever is present. Both become a User. */
export function requireUserAny(db: DB, req: IncomingMessage): User {
  // not implemented: const bearer = agentTokenUser(db, req);
  // return bearer ?? requireUser(db, req);
}
```

`requireUserAny` is the entire integration surface with existing auth. It
is additive: every existing cookie-authenticated route is untouched, and
`agentTokenUser` is pure addition that `requireUser` never calls, so the
browser session path cannot regress.

**Password change already revokes every session (`auth.ts`'s
`changePassword`). Extend the same statement to agent tokens**, same
"every other way in dies with the password" rationale already encoded
there — one more `DELETE FROM agent_tokens WHERE user_id = ?` beside the
existing `DELETE FROM sessions`.

**One triage module owns what "stale" and "summary" mean, reused by every
tool and any future human-facing UI:**

```ts
// server/src/triage.ts — new file, the only place that computes these shapes

export interface NoteSummary {
  id: number;
  preview: string;       // text, truncated; never the full body unless asked
  status: "todo" | "doing" | "done" | "approved";
  label: string | null;
  ageDays: number;        // now - updated_at
  updatedAt: string;
}

export interface BoardSummary {
  board: string;
  totalNotes: number;
  byStatus: Record<NoteSummary["status"], number>;
  oldestUntouched: NoteSummary[];  // top N by ageDays, excludes 'done'/'approved'
  lastActivityAt: string | null;
}

/** Resolves `boardRef` through the EXISTING userBoard/channelBoard + canSee,
 *  so a token can never see a board or a private note the owning user
 *  couldn't already see in the browser. This function owns zero visibility
 *  logic of its own — it calls boards.ts and filters nothing further. */
export function listNotesFor(db: DB, user: User, filters: { status?: NoteSummary["status"]; label?: string; olderThanDays?: number; boardRef?: string }): NoteSummary[] {
  // not implemented: boardRef ?? user.username through userBoard/channelBoard
  // (existing functions, existing visibility checks), map NoteRow -> NoteSummary,
  // apply status/label/olderThanDays as plain filters over that already-scoped set.
}

export function summarizeBoard(db: DB, user: User, boardRef?: string): BoardSummary {
  // not implemented: same scoping as listNotesFor with no filters, then
  // aggregate counts and pick oldestUntouched.
}

export function findStale(db: DB, user: User, olderThanDays: number, boardRef?: string): NoteSummary[] {
  // not implemented: listNotesFor(db, user, { olderThanDays, boardRef })
  // filtered to status != 'done' && status != 'approved'. A named export
  // so the MCP tool list reads "find_stale_notes", not "list_notes with
  // the right three args a model has to remember to pass" — but it is a
  // thin call into listNotesFor, not a second query path.
}
```

**MCP is mounted as a route on the existing process, not a second
process.**

```ts
// server/src/mcp.ts — new file

/** Registers the MCP Streamable HTTP endpoint on the existing http.Server.
 *  Reuses requireUserAny for auth, triage.ts for every tool body. */
export function attachMcp(route: (method: string, pattern: RegExp, handler: Handler) => void, db: DB): void {
  // not implemented: POST/GET/DELETE /mcp per the MCP Streamable HTTP
  // transport spec (@modelcontextprotocol/sdk's StreamableHTTPServerTransport).
  // Each tool handler: const user = requireUserAny(db, req); return
  // triage.<fn>(db, user, args). No tool handler touches `db` directly.
}
```

Three tools registered: `list_notes`, `get_board_summary`,
`find_stale_notes` — names and shapes exactly as in Usage above, each a
one-line call into `triage.ts`.

**What this hides, what it exposes.** The public surface is three tools
and one auth header. Hidden behind it: token hashing, the whole
public/private/channel-membership visibility model, and the question of
which board "mine" means. Exposed to the caller: a board reference
(`"mine"` or a username/slug they could already type into a URL) and a
handful of filter fields that mean exactly what they say. No tool takes a
raw board ID, a raw SQL fragment, or a visibility override — those stay
internal.

## Synthesis decision

Two structurally distinct shapes were compared.

**Candidate A — local stdio MCP script, shipped as a repo script, run on
the user's own machine; the server only grows new REST endpoints.** The
user runs `node scripts/mcp-client.mjs` locally (their agent's MCP config
points at that local process via stdio), which itself calls
`GET /api/agent/notes` etc. over HTTPS with the bearer token. Lowest cost
to the Fly machine (it's literally just more REST routes on the existing
process) and keeps the MCP protocol itself entirely off the server. But:
it asks every user to install and keep running a local script before their
agent can see anything, which directly works against "agent onboarding
friction" (is-agentic.com's own recommended check) and against
isitagentready.com's "MCP Server / manifest" discoverability check, which
scans the *domain*, not a script a visitor would have to find and run
themselves. It also doesn't match how the user already described wanting
this to work — "based on how agent can access the board" implies the board
itself is the thing being reached, not a middleman script.

**Candidate B — MCP mounted directly on the existing server
(`server/src/mcp.ts`), Streamable HTTP transport, same process, same
SQLite handle.** Zero local install: paste a URL and a token into any MCP
client that speaks remote HTTP (Claude Desktop, Claude Code, ChatGPT with
MCP support). Detectable at the domain by exactly the scanners this
project cares about. Costs one new dependency
(`@modelcontextprotocol/sdk`) and a little more always-resident code in
the one process Fly runs — acceptable, since Fly auto-stops the machine
when idle regardless of what's mounted on it, and the SDK's HTTP transport
is a thin JSON-RPC-over-HTTP layer, not a second database connection or
render loop.

**B wins.** It is the only shape that satisfies "an agent can access the
board" as asked, rather than "a script the user runs can access the
board" — and it is also the shape the agent-discoverability checkpoint
(G) needs anyway, so building it now means G's T37-T40 polish has
something real to point at instead of a stub. The one thing grafted from
A: its insight that the server-side surface should be plain, independently
testable functions (`triage.ts`) that don't know about MCP at all — so if
a second transport (or a human-facing "insights" panel) ever wants the
same data, it calls `triage.ts`, not the MCP layer. Candidate B's own
first draft would have put the query logic directly in the MCP tool
handlers; splitting it into `triage.ts` is the one change made to it
before calling it final.

## Tradeoffs accepted

- We accept running the MCP protocol logic inside the main server process,
  in exchange for zero extra memory-budgeted processes and a URL that is
  actually scannable at the domain.
- We accept a `preview`-truncated note text in every tool response (not
  the full note body) in exchange for not needing a separate "read full
  note" permission tier in v1 — if a triage summary isn't enough, nothing
  in v1 lets the agent fetch more; that's deliberate, not an oversight, so
  that cheap read-only tokens stay cheap and this ADR doesn't quietly grow
  into "export my whole private board."
- We accept that `find_stale_notes` is a thin wrapper over `listNotesFor`
  with two fields pre-set, in exchange for a tool name a calling model can
  reach for by description alone instead of having to assemble the right
  filter combination itself.

## Alternatives considered

- **Candidate A** (local stdio script), rejected above — fails the user's
  own framing ("how agent can access the board", not "how a locally-run
  helper can") and the discoverability goal that motivated this checkpoint
  in the first place.
- **Reimplementing visibility inside `triage.ts`** (a hand-rolled
  `WHERE board.owner_id = ? OR note.visibility = 'public'`) instead of
  calling `userBoard`/`channelBoard`, was considered and rejected outright,
  not as a runner — it is exactly the "split ownership" red flag: two
  places would decide what a user can see, and the agent-facing one would
  silently drift from `boards.ts`'s the next time a visibility rule
  changes (e.g. when F-02's allow/deny lists land). `triage.ts` as
  specified above calls the existing functions instead and owns no
  visibility logic of its own.

## Decisions (resolved 22 Oct)

- **Password change revokes agent tokens.** Confirmed — same statement as
  the existing session wipe, "every other way in dies with the password."
  One transaction, two deletes: `sessions` and `agent_tokens`, both
  `WHERE user_id = ?`.
- **A revoked/dead token gets its own error code, not a bare 401.** The
  MCP tool call (and any direct `/mcp` HTTP call) returns a structured
  error so the user's agent — and the user reading its output — can tell
  "this token died because the password changed or it was explicitly
  revoked" apart from "this token never existed" or "no token was sent at
  all." Three distinct cases, three distinct codes:

  ```ts
  // server/src/auth.ts — alongside agentTokenUser

  export type AgentAuthError = "missing_token" | "invalid_token" | "revoked_token";

  /** Same lookup as agentTokenUser, but distinguishes *why* there's no user,
   *  instead of collapsing every case to null. agentTokenUser itself stays
   *  as the cheap `User | null` check requireUserAny uses on the hot path;
   *  this is what the MCP error body is built from when that check fails. */
  export function classifyAgentAuthFailure(db: DB, req: IncomingMessage): AgentAuthError {
    // not implemented: no Authorization header -> "missing_token";
    // header present but token_hash has no row at all -> "invalid_token"
    // (never existed, or the raw token was wrong/mistyped);
    // header present, row exists, but revoked_at IS NOT NULL
    // (explicit revoke OR password-change cascade, same column either way)
    // -> "revoked_token".
  }
  ```

  `mcp.ts`'s tool handlers map this to the MCP error shape (`isError: true`
  with a `code` field a client can branch on) instead of a generic
  exception, so a dead token reads as "revoked_token: generate a new one
  in Settings," not a stack trace. The plain `/mcp` HTTP transport gets
  the matching status: `401` with `{ error: "missing_token" | "invalid_token"
  | "revoked_token" }` in the body, same three strings, so a curl-based
  verify-postits check and an MCP client see the same vocabulary.
- **One token per user for MVP.** Settings exposes "generate" (replaces
  any existing token — generating a new one invalidates the old one
  immediately, same UX as the existing "regenerate" pattern elsewhere in
  this app's auth) and "revoke." `agent_tokens` keeps its `label` column
  and its one-row-per-token shape regardless, so multiple labelled tokens
  later is a UI change and a dropped uniqueness constraint, not a schema
  migration.

## Open questions and risks

- **Rate limiting the MCP route**: the existing `Limiter` class
  (`auth.ts`) rate-limits login/signup by IP. Agent calls are
  per-token, potentially frequent (an agent re-summarizing a board every
  few seconds). Recommend a token-scoped limiter before this ships, sized
  generously (triage reads are cheap queries) — not designed here since it
  is a small addition to an already-designed shape, not a structural
  choice.
- **verify-postits will drive and prove this once built** (confirmed, not
  open). `.cursor/skills/verify-postits` currently drives everything
  through `claude-in-chrome`. Proving T35/T36 needs either a scriptable
  MCP client invoked from a shell step (most MCP SDKs ship one) or a thin
  `curl`-based check against `/mcp`'s HTTP transport directly. Add an
  `mcp-triage.md` feature file under `verify-postits/features/` once this
  is built, with the driving recipe being "call `/mcp` with a generated
  token via a minimal MCP SDK script, assert the returned summary matches
  a direct SQLite read, and separately assert a revoked token gets
  `revoked_token` not a generic failure" — the same persisted-state-over-
  client-render proof pattern the skill already uses for notes, plus the
  new error-code vocabulary above.

## Next implementation step

Add the `agent_tokens` migration and `generateAgentToken` /
`agentTokenUser` / `revokeAgentToken` to `server/src/auth.ts` (T33's
token generation/revocation), proven by a `spec/` check before anything
calls them from Settings or from `mcp.ts` — auth is the one piece here
that must be right before triage logic is built on top of it.
