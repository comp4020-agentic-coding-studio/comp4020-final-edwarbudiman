# Note status

Every note carries a status, `todo → doing → done`, shown as a chip in the note's footer ("○ to do", "◐ doing", "✓ done") and in its accessible name. `S` steps the selection forward, `Shift+S` steps it back; the ends stop rather than wrap and flash "Already done. Shift S goes back." or "Already to do.". Status persists on the server and reaches other viewers live.

## Sub-features

- `status-default` a new note starts at `todo`.
- `status-key-forward` `S` with notes selected steps each editable one forward.
- `status-key-back` `Shift+S` steps back.
- `status-button` the selection bar's `button "Status"` steps forward; Shift-click steps back.
- `status-ends` forward on `done` and back on `todo` change nothing and flash a message.
- `status-indicator` the footer chip is readable on all six note colours.
- `status-not-while-typing` `s` typed into a note in edit mode goes into the text.
- `status-live` a second session on the same board sees the change without reloading.

## How to get to it (user POV)

- Select a note (click it), then press `S` / `Shift+S`, or choose `Status` in the bottom selection bar (Shift-click to go back).
- The shortcuts dialog (`?`) lists "Status forward / back: S, Shift S".

## Driving it with claude-in-chrome

Preconditions: logged in as `demo1` on their own board (`/`).

- **Default.** Double-click empty canvas, type, `Escape`. The note is selected; its footer reads `○ to do`.
- **Forward.** `key "s"` → `◐ doing`; `key "s"` → `✓ done`; `key "s"` again → toast "Already done. Shift S goes back." and the chip stays `✓ done`.
- **Back.** `key "shift+s"` → `◐ doing`; `left_click` the `Status` button with `modifiers: "shift"` → `○ to do`; `key "shift+s"` → toast "Already to do.".
- **Persisted.** Query SQLite: `select id, text, status, version from notes` — status matches the chip and `version` bumps once per real step (not on the end no-ops).
- **Reload.** Navigate to `/` again; the chip shows the last status.
- **Colours.** Create one note per colour with a status each (POST `/api/boards/<id>/notes` with `{color, status}` from the logged-in tab via `javascript_tool`; demo1's board id is in `select id, slug from boards`), click `Fit`, and `zoom` on the footers.
- **Typing.** Double-click a note, type `" ss"`, `Escape`: text gains "ss", status unchanged.
- **Live.** Open a second MCP tab on the same board, change status in the first, then `find` in the second: its note group's name reads `"Note, doing: …"`.

## Gotchas

- `S` only acts with a selection; with nothing selected it does nothing (no flash).
- On someone else's board, notes you can't edit are skipped silently; on a channel any member can change status.
- `approved` is accepted by the DB constraint but rejected by the API (400) until jobs exist — only a job's giver approves (`fixed-idea.md` §3).
- Both MCP tabs share one cookie jar, so a second tab is the same user; that still proves websocket delivery. Cross-user delivery is covered by `spec/status.test.ts`.
- `Shift+1` (fit) can miss if focus isn't on the canvas; click the `Fit` button instead.
