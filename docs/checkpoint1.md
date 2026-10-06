# Checkpoint 1: the personal board

Where the **personal (user) board** stands, written at handover on 6 Oct, the
evening before the crit 8 cutoff, and updated the same evening when the
personal board was **finished for this checkpoint** (commit `957d95c`). It
covers only the personal board (your own at `/`, someone else's at
`/<username>`). Channels, chat and live features are already built but out
of scope here; see "Built beyond this checkpoint" at the end.
Task ids (T01, T05, …) are the ones in [backlog.md](backlog.md).

> **Status: personal board done for now** (`957d95c`). Edward re-directed
> the design to a white, minimal, Excalidraw-like canvas and checked it by
> hand; see "Personal board, finished" below. The first-pass "warm paper"
> look described further down is gone.

## Personal board, finished (6 Oct, evening)

| What | Where |
| --- | --- |
| **Routes.** Signed in, you land straight on your own board at `/` (no dashboard). Someone else's board is `/<username>`, a channel `/c/<slug>`. `/<your name>` and old `/u/<name>` links redirect. Sign-up reserves the app's own page names (`settings`, `stats`, `login`, `readme`, `api`, …) | `client/src/main.tsx`, `RESERVED_USERNAMES` in `server/src/auth.ts` |
| **Look.** White canvas, floating "islands": ☰ menu (shortcuts, settings, log out), label filter, tools + colours, zoom. "Clean minimal" for now; every restylable value (note shape, shadow, font, palette, canvas pattern) is a token at the top of `styles.css`, so a handwritten font or sketchy notes is a token swap | `client/src/styles.css` |
| **Selection.** Box-drag on empty canvas, Shift-click, ⌘A; the whole selection drags, moves with arrow keys, deletes. Panning moved to scroll, Space+drag, middle button or the Hand tool (H) | `Board.tsx` |
| **Copy / paste.** ⌘C/X/V on the selection (system clipboard as text + a custom type), pasted under the pointer keeping the layout; plain text pastes as a new note; ⌘D duplicates | `Board.tsx` |
| **Editing.** Double-click a note edits it in place (caret at the end); Esc or Enter saves. New notes are editable instantly under a temporary id, swapped for the real one when the server answers | `Board.tsx` |
| **Labels.** Up to 5 per note, ≤ 24 chars, de-duplicated ignoring case; only the author can change them. "Label" (L) on the selection; the "Labels" filter fades notes without the chosen labels, and notes made while filtering get the filter's labels. Migration 3 adds `notes.labels` | `server/src/boards.ts`, `db.ts`, `Board.tsx` |
| **People.** Live cursors on every board, a colour per person; avatars of everyone else present top right; click one to follow their cursor (Esc, panning or clicking again stops). Presence now lists each connection (`peers`) | `server/src/realtime.ts`, `Board.tsx` |
| **Checks.** `pnpm check` green: typecheck + 24 spec checks, including labels and the reserved names | `spec/notes.test.ts` |

Still open on the personal board: a real-phone check of the layout and touch,
Safari copy/paste, resizable notes, and whether "follow" should mirror the
other person's whole view (Excalidraw) rather than centre on their cursor.
Next up: the right-hand sidebar of saved users and channels (Chrome-style
bookmark folders) — design still being discussed.

## How to run it (mise, not the system Node)

```sh
mise exec -- pnpm install
mise exec -- pnpm build                  # client → client/dist
mise exec -- pnpm start                  # server on :8080, DB in ./data/app.db
# or, while changing things: mise exec -- pnpm dev   (server :8080 + Vite :5173)
APP_URL=http://localhost:8080 mise exec -- pnpm check   # typecheck + spec/
```

Demo log-in: `demo1` or `demo2`, password `postit-demo` (override with the
`DEMO_PASSWORD` env var). The README still has to say this (T13, Edward's).

## Done ✅

| Backlog | What exists | Where |
| --- | --- | --- |
| T01 (partly) | `.dsh-skills/`, `.vscode/` and the three skill-notes files are gitignored. The DSH skill-loading notes are copied into `CLAUDE.local.md` (gitignored, and DSH reads it) | `.gitignore`, `.dockerignore` |
| T02 | `server/` (Node 24 runs the `.ts` directly, no build step), `client/` (React + Vite). Scripts: `dev`, `build`, `start`; `pnpm check` = typecheck (server + client) + `spec/` | `package.json`, `scripts/dev.ts` |
| T03 | `/readme/` renders `README.md` on the server with `marked`. Images linked relatively are served from under `/readme/`. `/` answers 200 | `server/src/static.ts` |
| T04 | `node:sqlite`, migrations at boot (`PRAGMA user_version`), `DATA_DIR` (default `./data`, `/data` in Docker) | `server/src/db.ts` |
| T05 | Sign-up (username 3–20 chars `[a-z0-9_-]`, unique ignoring case; password ≥ 8; email optional), log-in, log-out, `/api/me`. Passwords hashed with scrypt. Session = random token in an httpOnly, SameSite=Lax cookie (Secure behind HTTPS); only its SHA-256 hash is stored. 30-day sliding expiry. Login rate limit (10 failures per IP + username, 50 per IP, per 15 min). Sign-up shows the "No email, no recovery" warning | `server/src/auth.ts`, `client/src/pages/Auth.tsx` |
| T06 | `demo1`/`demo2` seeded at boot (idempotent); their password and email can't be changed | `seedDemo()` in `auth.ts` |
| T07 (superseded) | Home: every username, filterable. **Replaced:** you now land on your own board; `Home.tsx` is kept but not routed until the saved-boards sidebar | `client/src/pages/Home.tsx` |
| T08 | Infinite canvas. Pan: drag empty space, scroll, or arrow keys. Zoom: Ctrl/⌘ + wheel, trackpad pinch, two-finger pinch on touch, +/− buttons and keys, clamped to 20–300%. "Fit" button. Notes stored in world coordinates. The view is kept per board for the session; resizing keeps the centre still | `client/src/pages/Board.tsx` |
| T09 | REST create / edit (text ≤ 280, 6 colours, public/private) / move / delete, with the permission table enforced on the server. Private notes filtered per viewer. Edits show at once and roll back on error | `server/src/boards.ts` |
| T10 | Visiting another user's board and leaving public or private notes ("New notes private" toggle) | same |
| T11 | `spec/notes.test.ts` (8 checks): private-note visibility (A / B / C), a visitor can't move, edit or delete others' notes, a note survives log-out and log-in, signed-out requests refused, sign-up rules, demo password locked. `spec/helpers.ts` checks **every** response for a password or hash | `spec/` |
| F-03 (board) | Tab focuses notes; arrows move (Shift = 50 px); Enter edits; Delete removes; Esc deselects; N adds a note. Checked at 1280×800 and 390×844 | `Board.tsx` |
| C10-01 (board) | One JSON log line per action (`signup`, `login`, `note.create`/`update`/`move`/`delete`, …). No note text, never a secret | `server/src/log.ts` |

**Verified:**
- `pnpm check` is green against a local server, and against a copy with
  production-only dependencies (the same layout as the Docker image). That's
  23 checks in total, including the shipped invariants.
- A headless-Chrome script went through: sign-up → my board → add and write
  a note → mouse drag → reload (position kept) → keyboard move → reload → zoom.
  It also checked that a visitor's private note shows on the owner's board
  and stays hidden from a third user, and the phone-sized layout.

## Not done ❌ (personal board only)

- ~~**Design / brand.**~~ Done: see "Personal board, finished" above.
- **Touch on a real phone.** Long-press (350 ms) to drag a note and two-finger
  pinch are written but untested on a device.
- **No undo, and delete doesn't ask to confirm.** Notes are a fixed 200×160;
  long text is cut off rather than scrolling. (Copy/paste and duplicate make
  a deleted note easy to keep a spare of, but there's still no undo.)
- **T12.** The Dockerfile is written (multi-stage, `node:24.21.0-slim`,
  `--max-old-space-size=160`) but **has never been built**. The runtime
  layout was tested locally instead.
- **T13 [Edward].** The README is still the template. It needs the demo
  password, plus what good means, who it's for and what's not being built.
- **T14.** `CLAUDE.md` still holds the DSH skill notes, a copy of
  `CLAUDE.local.md`. Its project rules (derived from the README, pointing at
  `spec/`) aren't written.
- **T15.** `docs/adr/0001-stack.md` and `0002-sqlite-driver.md` aren't written.
- ~~**Commit.**~~ Done in `957d95c` (not pushed yet). `CLAUDE.md` is left out on
  purpose: it still only holds the DSH skill notes (see T14).
- **T27 / T28 [Edward / ops].** PROCESS.md, `reflections/crit-8.md`,
  preflight and ship.

## Built beyond this checkpoint (parked, not reviewed)

Live updates over WebSocket with per-recipient private filtering, live
cursors and an anonymous mode, the first-holder-wins drag lock, channels (public, with a key, or by
allow/deny list), peer-held chat that the server signs but never stores,
history handoff that a peer can decline, reconnect and resync, and a `/stats`
page. Code: `server/src/realtime.ts`, the channel half of `boards.ts`,
`client/src/pages/Chat.tsx`. Checks: `spec/realtime.test.ts`,
`spec/channels.test.ts`, `spec/chat.test.ts`. They all pass, but nobody has
judged the design or behaviour. Pick them up checkpoint by checkpoint after
the personal board is settled.
