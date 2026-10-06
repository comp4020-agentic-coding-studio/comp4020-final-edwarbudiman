# Backlog

The task list for the final project: what we decided to build, in what order,
and why. The brief and spec live on the course site
([final project](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/assessments/final-project/));
this file records decisions and work, not a second spec. Tasks move to **Done**
with the commit that finished them.

Legend: **[me]** = Edward writes it himself (the brief asks for README,
PROCESS.md and reflections to be student-drafted) · **[agent]** = built with
the agent · **[ops]** = manual step.

Cutoffs (Baishi group, Wed 09:00 session, Canberra time):

| Deliverable | Cutoff |
| ----------- | ------ |
| Crit 8 — It's alive! | **Wed 7 Oct 07:00** |
| Crit 9 — All at once | Wed 14 Oct 07:00 |
| Crit 10 — Fly by instruments | Wed 21 Oct 07:00 |
| Final project | Mon 9 Nov 12:00 |

---

## 1. Decisions so far

### Product

- **Core thing:** post-it notes on boards. Nothing else interactive for now —
  no polls, drawing, stickers, reactions.
- **Two kinds of board:** a **user board** (one per account, at `/u/<username>`)
  and **channel boards** (shared, at `/c/<slug>`).
- **Co-presence is the point:** being on a board while others are there makes
  it less lonely; if you can't reach someone in a channel, you hop to their
  board and leave them a note.
- **Prioritise by placement:** an infinite canvas (FigJam-like) where you put
  notes wherever you like; grouping by position *is* the categorisation, with
  colour as a second axis.
- **Finding people:** a directory of every username on the home page; click to
  hop to their board.

_Edward's raw notes for the README (his to write up, not the agent's):_ the
"not lonely" reason for co-presence; hop to someone's board when the channel
doesn't reach them; prioritise by where you place things; deliberately no
polls/drawing/stickers.

### Accounts

- Sign up with **username + password**, **email optional**.
- **No email = no recovery:** sign-up warns that a forgotten password means the
  account and its notes are lost. Password reset by email is a later card and
  only works for accounts that gave one.
- **Login required for everything** except sign-up, log-in and `/readme/`
  (markers start there; `/` must also answer 200 — the sign-in page does).
- **Demo accounts** `demo1`, `demo2` (password documented in README) are the
  way in for markers and demos; seeded at boot; their passwords can't be
  changed.
- Passwords hashed with `scrypt` (`node:crypto`), never stored or returned in
  plain text. Session = random token in an httpOnly / Secure / SameSite=Lax
  cookie; only its SHA-256 hash is stored.

### Notes

- **Content:** plain text (≤ 280 chars) + one colour from a small palette
  (5–6 colours); fixed size.
- **Visibility (user boards only):** per note, **public** or **private**.
  - private note on **my** board → only me
  - private note I leave on **someone else's** board → only me and that board's
    owner
- **Who can do what:**

  | Board | Create | Edit text | Move | Delete |
  | ----- | ------ | --------- | ---- | ------ |
  | User board (owner) | ✓ | own notes | any note on it | any note on it |
  | User board (visitor) | ✓ | own notes | own notes | own notes |
  | Channel board (member) | ✓ | any | any | any _(see open Q2)_ |

### Real-time and presence

- **WebSockets**, one room per board; the server is authoritative and relays
  changes to everyone in the room (target: < 1 s, no reload).
- **Live cursors** with usernames on whatever board you're viewing.
- **Anonymous setting:** a per-user toggle; when on, your cursor shows as a
  nameless "someone".
- **Drag lock, first holder wins:** grabbing a note locks it for everyone else
  until drop, disconnect, or ~10 s without movement. Lock state is in server
  memory only.

### Channels

- Any user can create a channel: **public** (anyone logged in can join) or
  **private with a key** (key hashed like a password; entering it once makes
  you a member, stored in the DB).
- Later: allow/deny lists by username instead of (or as well as) a key.

### Channel chat — ephemeral, held by peers

- **The server stores no chat**, not even in memory. It's a relay.
- Live message: client → server, which stamps `id`, `author`, `ts` and an
  **HMAC signature**, broadcasts it to the room, and forgets it.
- Each client keeps the history it has seen (in memory for the tab).
- Newcomer joins → server asks one present peer for its history → relays the
  answer to the newcomer, dropping any line whose HMAC doesn't verify (so a
  peer can't forge other people's lines). Peer doesn't answer in ~2 s → ask
  the next one. History capped (e.g. last 200 lines).
- **Consequence to argue in the README:** a message lives as long as someone
  who saw it is still in the room. When the last person leaves, it's gone.
- **Consent** (whether a peer shares what it holds) is acknowledged as an issue;
  MVP shares by default, card F-01 revisits it.

### Stack

- **Server:** Node 24 + TypeScript, one process; `ws` for WebSockets.
- **Client:** React + Vite, built to static files and served by the same
  server.
- **DB:** SQLite via built-in **`node:sqlite`** at `/data/app.db` (local:
  `./data/app.db`); plain SQL, no ORM. Pin the Node version in the Docker image
  so the experimental API can't shift under us; silence the
  `ExperimentalWarning`.
- **`/readme/`:** `README.md` rendered to HTML on the server (e.g. `marked`) so
  the shipped heading check passes with no client JS; relative images resolve.
- **Deploy:** multi-stage `Dockerfile` (build client + server → slim runtime);
  fits 256 MB. Local dev first; CI deploys to Fly once the repo is public.

---

## 2. Schema (smallest that carries the core loop)

```
users(id, username UNIQUE COLLATE NOCASE, email NULL UNIQUE, pw_hash,
      is_demo, anonymous, created_at)
sessions(token_hash PK, user_id, expires_at)
boards(id, kind CHECK(kind IN ('user','channel')), owner_id NULL,
       slug UNIQUE, name, visibility CHECK(IN ('public','key')), key_hash NULL,
       created_at)
board_members(board_id, user_id, PRIMARY KEY(board_id, user_id))
notes(id, board_id, author_id, text, color, x REAL, y REAL, z INTEGER,
      visibility CHECK(IN ('public','private')), version INTEGER,
      created_at, updated_at)
-- not in the DB: presence, cursors, drag locks (server memory, tiny);
-- chat (never on the server)
```

## 3. WebSocket messages (sketch)

```
client → server                         server → room
join {board}                            presence {users[], anon count}
note:create {text,color,x,y,vis}        note:upsert {note}
note:update {id,text?,color?,vis?}      note:upsert {note}
note:move {id,x,y}   (while locked)     note:move {id,x,y}
note:delete {id}                        note:delete {id}
lock:acquire {id} / lock:release {id}   lock {id, holder|"someone"|null}
cursor {x,y}  (≤ 20/s)                  cursor {sid, name|null, x, y}
chat:send {text}                        chat:msg {id,author,ts,text,sig}
chat:history:reply {to, lines[]}        chat:history:request {to}  (to one peer)
                                        chat:history {lines[]}     (to newcomer)
```

Private notes are filtered **per recipient** before sending: a private note is
only ever sent to the sockets of its author and the board owner.

---

## 4. Tonight — crit 8 MVP (in build order)

Everything below is in scope tonight. It's ordered so that **each checkpoint is
a shippable state**: if time runs out, ship the last green checkpoint. Crit 8
itself only needs checkpoint A.

### Checkpoint A — crit 8 floor (persistence, no real-time)

- [ ] **T01 [ops]** Clean the repo for going public: decide what happens to
      `.dsh-skills/`, `.vscode/`, `COMP4020-SKILLS-INSTALLED.md`,
      `comp4020-skill-installation-guide.md`, `example-skill-adaptation.md`
      (commit as part of the harness, or gitignore). Split the DSH skill-loading
      notes out of `CLAUDE.md` so `CLAUDE.md` can hold the project's rules.
- [ ] **T02 [agent]** Project skeleton: `server/` (Node + TS), `client/`
      (React + Vite), scripts `dev`, `build`, `start`; `pnpm check` still runs
      the shipped `spec/`.
- [ ] **T03 [agent]** `/readme/` rendered from `README.md` server-side, images
      resolve; `/` answers 200.
- [ ] **T04 [agent]** SQLite open + migrations at boot (`node:sqlite`,
      `DATA_DIR` env, default `./data`, `/data` in Docker).
- [ ] **T05 [agent]** Auth API: sign up (username rules: 3–20 chars
      `[a-z0-9_-]`, case-insensitive unique; password ≥ 8), log in, log out,
      `me`; scrypt; session cookie; login rate limit; "no email = no recovery"
      warning in the sign-up UI.
- [ ] **T06 [agent]** Seed `demo1`/`demo2` at boot (idempotent); block
      password change for demo accounts.
- [ ] **T07 [agent]** Home: directory of all users → link to `/u/<username>`;
      "my board" link; log out.
- [ ] **T08 [agent]** Board page with **infinite canvas**: pan (drag empty
      space / scroll), zoom (wheel/pinch, clamped), world coordinates stored on
      notes; touch works on phones.
- [ ] **T09 [agent]** Notes via REST: create, edit text/colour/visibility,
      move, delete, enforcing the permission table above; private-note
      filtering per viewer.
- [ ] **T10 [agent]** Leave notes on another user's board (public/private).
- [ ] **T11 [agent]** `spec/` checks (against the running app):
      - private note on A's board is absent from B's view of it
      - private note B leaves on A's board is visible to A, not to C
      - a visitor can't move/delete someone else's note on A's board
      - a note survives log-out/log-in (a fresh session sees it)
      - no response ever contains a password or its hash
- [ ] **T12 [agent]** Dockerfile (multi-stage), builds and runs locally with a
      throwaway `/data`; `pnpm check` green against it (mirrors CI).
- [ ] **T13 [me]** `README.md` first version: what good means, who it's for,
      what you read, what you're not building, demo-account note.
- [ ] **T14 [agent → me edits]** `CLAUDE.md` rules derived from the README,
      pointing at the `spec/` checks.
- [ ] **T15 [agent]** `docs/adr/0001-stack.md`, `docs/adr/0002-sqlite-driver.md`.
- [ ] **Commit + push** at the end of checkpoint A.

### Checkpoint B — real-time, cursors, lock

- [ ] **T16** WebSocket server on the same port; cookie auth + Origin check on
      upgrade; one room per board.
- [ ] **T17** Move note CRUD onto WS (or broadcast after REST writes); per-
      recipient private filtering; reconnect → full resync.
- [ ] **T18** Live cursors in world coordinates, throttled ≤ 20/s; anonymous
      toggle in settings → nameless cursor.
- [ ] **T19** Drag lock (first holder wins, 10 s idle timeout, release on
      disconnect); locked note shows who holds it.
- [ ] **T20** `spec/` checks: change in session A reaches B in < 1 s; a second
      client can't move a locked note.
- [ ] **Commit + push.**

### Checkpoint C — channels

- [ ] **T21** Create channel (public / key); channel list on home; join with
      key → membership row.
- [ ] **T22** Channel board: every member can create/edit/move/delete notes.
- [ ] **T23** `spec/` check: private channel refuses join without the key; key
      never returned.
- [ ] **Commit + push.**

### Checkpoint D — ephemeral peer-held chat

- [ ] **T24** Chat panel on channel boards; `chat:send` → stamped + HMAC'd
      broadcast; nothing stored server-side.
- [ ] **T25** History handoff: request to one peer, timeout → next peer,
      verify HMAC per line, cap 200.
- [ ] **T26** `spec/` check: after every member leaves, a newcomer gets no
      history.
- [ ] **Commit + push.**

### Before 07:00 — ship

- [ ] **T27 [me]** `PROCESS.md` first version (commit links) +
      `reflections/crit-8.md`; `pnpm check:evidence` passes.
- [ ] **T28 [ops]** **preflight**, then **ship** (repo public → CI checks and
      deploys). Leave time for one failed CI run. ⚠️ Fly reported
      `Could not find App "comp4020-final-edwarbudiman"` with the local token:
      ask on Ed now so the CI deploy doesn't fail at the cutoff.

---

## 5. Later crits

### Crit 9 — All at once (Wed 14 Oct 07:00)

- [ ] **C9-01** ADR-0003: drag lock, first holder wins (the crit's written
      decision): options, why, cost.
- [ ] **C9-02** Anything from checkpoints B–D that didn't land on 7 Oct.
- [ ] **C9-03 [me]** PROCESS.md rewrite + `reflections/crit-9.md`.

### Crit 10 — Fly by instruments (Wed 21 Oct 07:00)

- [ ] **C10-01** One structured JSON log line per user action (who, what,
      when); never note text of private notes, never chat text.
- [ ] **C10-02** Live view: a small stats page, or a documented `flyctl logs`
      tail.
- [ ] **C10-03** Password reset for accounts with an email (needs a sending
      domain; otherwise record why not in an ADR).
- [ ] **C10-04 [me]** PROCESS.md rewrite + `reflections/crit-10.md`.

### Final (Mon 9 Nov 12:00)

- [ ] **F-01** Chat-history consent: a peer can decline to share.
- [ ] **F-02** Private channels by allow/deny username list.
- [ ] **F-03** Keyboard: focus a note, arrow keys move it; both marking
      viewports; resize mid-use.
- [ ] **F-04** Resilience: slow connection, reconnect + resync, a session
      picked up the next day.
- [ ] **F-05 [me]** Final README (400–600 words, sourced) and PROCESS.md
      (900–1100 words).

---

## 6. Open questions (answer before or during implementation)

1. **Notes by an anonymous user:** anonymous hides the cursor name; does it also
   hide the author on notes they leave on someone's board? (Default: no —
   notes always show the author; anonymity is about presence only.)
2. **Channel deletes:** "everyone can edit" — does that include deleting other
   people's notes? (Default: yes, any member.)
3. **Per-note privacy on channels:** none (default), 
4. **Who can create channels, and can a channel be deleted?** (Default: any
   user creates; no delete.)
5. **Infinite canvas on a phone:** pinch-zoom + one-finger pan on empty space,
   long-press to drag a note? (Default: yes.)

## Done

_(nothing yet)_
