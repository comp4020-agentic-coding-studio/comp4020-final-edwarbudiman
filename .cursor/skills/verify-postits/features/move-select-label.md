# Move, select, and label notes

Move, select, and label lets a user drag notes around the board, multi-select with a box or shift-click, give notes a color or label, and filter the board down to notes with chosen labels.

## Sub-features

- `select-single` selects one note by clicking it.
- `select-box` box-selects multiple notes by dragging on empty canvas.
- `select-shift` adds a note to the selection with shift-click.
- `move-drag` drags a selected note (or selection) to a new position.
- `color-set` sets a note's color via the color `radio` group.
- `label-set` assigns a label via the `Label` button and `Labels` dialog.
- `filter-labels` shows only notes with chosen labels via the `Filter by label` dialog.

## How to get to it (user POV)

- Click a note to select it; drag a box on empty canvas to select several; shift-click to add one to an existing selection.
- Drag a selected note (or any note in a multi-selection) to move it.
- With a selection active, choose a color swatch in the toolbar's `radiogroup "Colour of the selected notes"`.
- With a selection active, choose `Label` in the bottom status bar to open `role="dialog" aria-label="Labels"`.
- Choose `button "Show only notes with certain labels"` in the toolbar to open `role="dialog" aria-label="Filter by label"`.

## Driving it with claude-in-chrome

Preconditions:

- Logged in as `demo1` on their own board.
- At least two notes exist on the board (create via `create-edit-note.md`'s recipe, e.g. at `[500,400]` and `[800,400]`).

- **Select one.** `computer left_click` on a note's body (not its edge). Status bar shows `1 note`.
- **Box-select both.** Click empty canvas to deselect, then `computer left_click_drag` from a point above-left of both notes to a point below-right of both. Status bar shows `2 notes`.
- **Move.** With one note selected, `computer left_click_drag` from inside the note to a new canvas point. Re-`read_page` or screenshot: the note renders at the new position.
- **Confirm persistence.** Query `select id, x, y from notes where id=<id>` against `$DATA_DIR/app.db` — `x`/`y` match the drop point's canvas coordinates (not raw screen pixels if the board is panned/zoomed).
- **Set color.** With a note selected, `computer left_click` a `radio` in `radiogroup "Colour of the selected notes"` (e.g. "Blue"). Screenshot shows the note's fill color changed; SQLite `color` column matches.
- **Set label.** `computer left_click` on `button "Label"`, then in the `dialog aria-label="Labels"`, create/choose a label. Close the dialog; the note shows the label.
- **Filter.** `computer left_click` on `button "Show only notes with certain labels"`, select the label used above in `dialog aria-label="Filter by label"`, close it. Only the labeled note remains visible on the board; the other note is hidden (not deleted — re-opening the filter and clearing it brings it back).

## Gotchas

- A box-select drag that starts on top of a note moves that note instead of starting a selection box — always start the drag from visibly empty canvas.
- The color `radiogroup` has two instances in the toolbar: "Colour for new notes" (applies to notes you create next) and "Colour of the selected notes" (applies to the current selection) — only the latter appears, and only when a selection is active; picking the wrong one silently does nothing if no selection exists.
- Filtering hides notes client-side; don't mistake a filtered-out note for a deleted one when checking SQLite (the row still exists).
- This feature was mapped from code/ARIA inspection (`client/src/pages/Board.tsx`), not yet driven end-to-end in this skill's proving run — the Launch step proved `create-edit-note` only. Drive this recipe fully before relying on it; if a step's selector or behavior drifts from what's written here, update this file and note the discrepancy.
