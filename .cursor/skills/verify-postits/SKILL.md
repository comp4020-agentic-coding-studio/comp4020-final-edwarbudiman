---
name: verify-postits
description: Drive the Post-its web app (React client on Vite + Node/ws server + SQLite) like a real user — log in, create/move/label/filter notes, live cursors, channels, chat — and capture proof the feature actually works. Use whenever a change to this repo needs to be proven working in the real app, not just passing vitest.
---

# Verify Post-its

Post-its is a web app: a post-it note board with live multi-user cursors, per-user boards, and channels with chat. The server (Node, `node:sqlite`, raw `http`/`ws`) is the source of truth; the client (React + Vite) is a thin canvas UI. There is no existing browser-driving harness in this repo — `spec/helpers.ts` only drives the HTTP/WS API, never the DOM — so this skill is the first and only way to prove the UI itself works.

## Worktrees

This repo keeps each feature in its own linked worktree (`.claude/worktrees/<name>`, branch `feat/<name>`; see root `CLAUDE.md`). Run this skill **from the worktree whose feature you're verifying**, not from root, unless the feature you're checking is already merged into `main` — root's checkout is only current for merged work. A fresh worktree doesn't have `.cursor/skills/verify-postits/` until it's committed on `main` and picked up by `scripts/sync-worktrees.sh`; if the skill is missing from a worktree, either run the sync script from root first, or point this skill's launch commands at the worktree's path explicitly (the launch commands below are plain shell run with the worktree as cwd — no path changes needed once cwd is set correctly).

Each verification run already uses a fresh `PORT`/`DATA_DIR` per run (see Launch below), so two worktrees — or two verification runs in the same worktree — can run side by side without colliding, as long as each run picks its own port pair.

## Launch

Run two isolated instances side by side without touching the developer's own `pnpm dev` session, by overriding env vars the server and client already read (`server/src/config.ts`, `client/vite.config.ts`):

```bash
RUN_ID=$(date +%s)
export DATA_DIR=/tmp/postit-verify-$RUN_ID
export PORT=18080
mkdir -p "$DATA_DIR"
node --disable-warning=ExperimentalWarning server/src/index.ts > /tmp/postit-verify-server-$RUN_ID.log 2>&1 &
SERVER_PID=$!

API_URL=http://localhost:18080 pnpm exec vite --config client/vite.config.ts --port 18173 > /tmp/postit-verify-client-$RUN_ID.log 2>&1 &
CLIENT_PID=$!
```

- Ready when `curl -s http://localhost:18080/healthz` returns `{"ok":true}` AND `curl -s -o /dev/null -w '%{http_code}' http://localhost:18173` returns `200`. Poll both every 200ms, up to 20s. A 200 from the client alone does not mean the server behind its proxy is up.
- The server runs its own migrations and calls `seedDemo(db)` on boot (`server/src/index.ts`), so `demo1` / `demo2` (password `postit-demo`, or `$DEMO_PASSWORD` if you override it) exist from a cold, empty `DATA_DIR` with no extra seed step. A `#lobby` channel is auto-created and both demo users are joined to it.
- Teardown: `kill $SERVER_PID $CLIENT_PID`, then confirm with `lsof -i:18080 -i:18173` (expect nothing), then `rm -rf "$DATA_DIR" /tmp/postit-verify-server-$RUN_ID.log /tmp/postit-verify-client-$RUN_ID.log`.
- Never reuse port 8080/5173 (the developer's own `pnpm dev`) or its `./data/app.db` for a verification run — always pick a fresh port pair and `DATA_DIR` per run, so a crash or leftover note never lands in the real dev database.

## Doctor

Before driving anything, confirm the instance is actually usable, not just "a process exists":

```bash
curl -s http://localhost:18080/healthz          # {"ok":true}
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:18173   # 200
curl -s -X POST http://localhost:18080/api/login -H 'content-type: application/json' \
  -d '{"username":"demo1","password":"postit-demo"}' -i | head -1   # expect 200, with a Set-Cookie: sid=...
```

If the login check fails, the board can never be reached, so stop and report the failure rather than trying UI workarounds.

## Drive

Use `claude-in-chrome` (no Playwright/Puppeteer config exists in this repo). Open a fresh MCP tab, `navigate` to `http://localhost:18173` (never the raw `:18080` server port — the client's Vite proxy forwards `/api`, `/ws`, `/readme`), then prefer `read_page`/`find` with ARIA roles and accessible names over coordinates, since the board is a canvas and raw positions drift with scroll/zoom state. Close the tab when the run ends.

Stable handles confirmed by driving the app directly (not guessed):

- Login form: plain `textbox` (username, no label) then `textbox type="password"`, then `button "Log in"` (submit). Demo hint text on the page: "Just looking? Log in as demo1 or demo2 — the password is in the README."
- Toolbar (after login, on a board): `button "Hand: drag to move around (H, or hold Space)"`, `button "Select: click or drag a box (V)"`, `button "Add a note (N)"`, color `radio`s "Yellow"/"Pink"/"Blue"/"Green"/"Orange"/"Purple", `button "Show only notes with certain labels"`, `button "Keyboard shortcuts (?)"`.
- Board canvas: `application` with an `aria-label` starting "Your board: infinite canvas. Arrow keys pan, plus and minus zoom, N adds a note, Tab moves between n…". **Double-click empty canvas** (not the toolbar "Note" button alone) opens a new note in edit mode; clicking the toolbar button only arms the tool, it doesn't place a note until you click/double-click the canvas.
- Note editing: type while the note is focused in edit mode, `Escape` commits the text and exits edit mode. A selected note shows a status bar at the bottom: `"<n> note(s)"`, `button "Edit"`, `button "Label"`, `button "Duplicate"`, `button "Delete"`.
- Zoom controls: `button "Zoom out"`, `button "Reset zoom (0)"`, `button "Zoom in"`, `button "Show all notes (Shift+1)"`.
- Sidebar: `button "Browse channels"`, `button "Create a channel"`, channel links like `link "Say hi. Everyone starts here." href="/c/lobby"`, `button "Your board, settings, log out"`, `button "Hide the sidebar"`.
- Per-user boards live at `/<username>` (reserved names that are NOT usernames: settings, stats, login, logout, signup, readme, api, assets, healthz, admin, help, about, new). Channels live at `/c/<slug>`.
- Chat (inside a channel board): `aria-label="Channel chat"` panel, `aria-label="Close chat"`, `aria-label="Message"` input.
- Presence: `role="group" aria-label="People on this board"` when a second user/session is on the same board; `role="status"` chip when following someone's cursor.

For live-cursor / multi-user features, open two MCP tabs logged in as `demo1` and `demo2` on the same board (`demo1`'s own board at `/`, which `demo2` reaches at `/demo1`), and act in one tab while reading `read_page`/screenshot state from the other.

## Evidence

For each feature, capture:

- A screenshot of the acted-on state (e.g. note just created/moved/labeled) — `computer` action `screenshot` with `save_to_disk: true`.
- The **persisted** state, not just the client's optimistic render: query the SQLite file directly, since the server is the source of truth and a UI-only check can pass on a client that never sent the mutation:
  ```bash
  node -e "const {DatabaseSync}=require('node:sqlite'); const db=new DatabaseSync(process.env.DATA_DIR+'/app.db'); console.log(db.prepare('select id, text, color, x, y from notes').all());"
  ```
- For multi-user features (cursors, presence, chat), a screenshot or `read_page` from the *second* tab showing the first tab's action arrived over the websocket — a proof that only checks the acting tab does not demonstrate realtime sync.
- Put proof artifacts under `/tmp/postit-verify-$RUN_ID/evidence/` (screenshots) and keep the DB query output inline in your report. Evidence survives cleanup: only the running instance and its `DATA_DIR` get torn down, never files already written to `evidence/`.
- Never trust a test-only/dry-run endpoint as proof — this app has none, so always go through the real `/api/*` routes and the real UI, the same path `spec/helpers.ts` warns to screen for leaked secrets in responses (do the same: never print `password`/`hash` fields from a response in your evidence).

## Cleanup

```bash
kill $SERVER_PID $CLIENT_PID 2>/dev/null
lsof -i:18080 -i:18173     # expect nothing
rm -rf "$DATA_DIR" /tmp/postit-verify-server-$RUN_ID.log /tmp/postit-verify-client-$RUN_ID.log
```

Kill only the PIDs you started this run — never `pkill -f vite` or `pkill -f node`, which would also kill the developer's own `pnpm dev` session if one happens to be running.

## Helpers

None shipped yet; every step above is a literal command to run directly. If this skill gets used often enough to be worth scripting (e.g. a `verify.sh` that wraps launch/doctor/cleanup), add it here and show its invocation.

## Feature map

See `features/README.md` for the maintained index of user-facing features and how to drive each one. Keep it honest as the app changes — see `/pstack:maintain-verification-skill`.
