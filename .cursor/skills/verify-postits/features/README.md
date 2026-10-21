# Post-its verification map

This directory is the maintained source for verifying the user-facing behavior of Post-its. Read the index before driving the app, then use the matching feature file as the recipe.

## Baseline preconditions

- Launch Post-its per `../SKILL.md` Launch section: server on `http://localhost:18080`, client on `http://localhost:18173`, a fresh `DATA_DIR=/tmp/postit-verify-$RUN_ID`.
- `demo1` / `demo2` (password `postit-demo`) are seeded automatically on boot — no extra seed step.
- Run the doctor checks in `../SKILL.md` and require `{"ok":true}` from `/healthz`, `200` from the client, and `200` with a `Set-Cookie` from `/api/login`.
- Never drive an instance that was not started by this verification run (check `DATA_DIR` matches the one you launched).

## Driving conventions

- Start every recipe from the baseline state unless its preconditions say otherwise.
- Prefer ARIA roles and accessible names (via `read_page`/`find`) over coordinates — the board is an infinite canvas, so raw pixel positions drift with pan/zoom.
- Double-click the canvas (not just the toolbar "Note" button) to place a new note.
- Restore seeded data after a mutation (delete notes/channels you created) during cleanup, but keep proof artifacts.

## Proof and skip reporting

- Capture the user action and the resulting state, not only the final screenshot.
- UI proof includes a `read_page` snapshot (interactive or full) and a screenshot showing the app identity ("Post-its" header) visible.
- Mutation proof includes a direct SQLite read of the affected row(s) from `$DATA_DIR/app.db` — the server is the source of truth, the client's render is not sufficient alone.
- Multi-user proof includes a second tab's view (second `demo2` session) showing the first tab's action arrived live.
- Record the feature ID and entry point used with every artifact.
- Report an unreachable path with the attempted command and the unmet precondition. Do not report a skipped entry point as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior, then uses exactly four H2 sections in this order: `Sub-features`, `How to get to it (user POV)`, `Driving it with claude-in-chrome`, `Gotchas`.

## Features

- [Log in](./login.md) covers demo-account login, session cookie, and the board landing redirect.
- [Create and edit a note](./create-edit-note.md) covers placing, typing, committing, and persisting a note.
- [Move, select, and label notes](./move-select-label.md) covers dragging, multi-select, color, labels, and the label filter.
- [Live cursors and presence](./live-cursors-presence.md) covers seeing another user's cursor and following them.
- [Channels and chat](./channels-chat.md) covers joining a channel, posting a chat message, and sidebar unread counts.
