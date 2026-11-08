# Create and edit a note

Create and edit a note lets a user place a post-it anywhere on their board, type text into it, and have it persist across reloads.

## Sub-features

- `create-open` opens a note in edit mode by double-clicking empty canvas.
- `create-save` commits typed text on `Escape` and persists it server-side.
- `edit-reopen` re-opens an existing note's text for editing via the status-bar `Edit` button.
- `delete-note` removes a note via the status-bar `Delete` button.

## How to get to it (user POV)

- Double-click anywhere on an empty board canvas (the empty-board hint literally says "Double-click anywhere to add a note, or press N").
- Press `N` while focus is on the canvas (not inside a text field) to arm the note tool, then click the canvas to place one.
- Select an existing note, choose `Edit` in the bottom status bar.

## Driving it with claude-in-chrome

Preconditions:

- Logged in as `demo1` on their own board (`login.md`), board empty or with no note at the probe position.
- `DATA_DIR` known so the SQLite file can be queried directly.

- **Open editor.** `computer double_click` on an empty point of the canvas (e.g. `[700, 400]`). A note appears at that point already in edit mode with a text cursor.
- **Enter text.** `computer type` with the probe text, e.g. `Verification probe note`.
- **Commit.** `computer key Escape`. The note shows the typed text as static content; the bottom status bar reads `1 note` with `Edit` / `Label` / `Duplicate` / `Delete` buttons.
- **Confirm persistence (server-side).** Run `node -e "const {DatabaseSync}=require('node:sqlite'); const db=new DatabaseSync(process.env.DATA_DIR+'/app.db'); console.log(db.prepare('select id, text, color from notes').all());"`. The row's `text` matches the typed text exactly.
- **Proof.** Screenshot of the committed note plus the SQLite query output side by side.
- **Delete (cleanup of this probe).** With the note still selected, `computer left_click` on `button "Delete"`. Re-run the SQLite query — the row is gone (`[]`).

## Gotchas

- Clicking the toolbar `button "Add a note (N)"` only arms the tool; it does not place a note until you then click/double-click the canvas. Double-clicking directly on empty canvas skips the toolbar step entirely and is the more reliable path.
- `Escape` commits the current text; it does not discard it like a typical "cancel" — there is no separate cancel action confirmed for a freshly-created note, so don't assume `Escape` means "undo".
- Don't check only the client's rendered DOM as proof of persistence — the client renders optimistically before the server confirms. Always cross-check the SQLite row.
- Double-clicking too close to an existing note edits that note instead of creating a new one; pick an empty point, confirmed via a screenshot first if the board isn't empty.
