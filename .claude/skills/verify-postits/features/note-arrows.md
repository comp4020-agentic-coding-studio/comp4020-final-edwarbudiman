# Note arrows

On their own board, the owner draws plain one-way arrows between notes ("this note affects that note"). Each end is magnetic: it snaps to any point on any edge of a note within about 36px, and can be dragged again later. Arrows sync live, survive a reload, and are saved in the `note_arrows` table. Visitors see them read-only, and never see an arrow that touches a note they can't see (a private one). Channel boards have no arrows.

## Sub-features

- `arrow-tool` the toolbar Arrow button (key `A`) turns notes into drag sources: drag from note A onto note B draws A→B. Esc, `V` or another tool leaves it. Dragging empty board pans.
- `arrow-nub` in Select mode a small nub shows on the edge (top, right, bottom or left) nearest the mouse, measured from the note's centre, on hover only. Drag it onto another note.
- `arrow-snap` while drawing, the tip follows the mouse freely and snaps with a ring to the nearest border point within ~36px, on any side. Releasing far from any note cancels.
- `arrow-move-end` hovering an arrow shows a handle on each end (hover only, not when selected). Dragging one slides it along the border, or onto another note to re-target. A self-arrow or a duplicate is refused; releasing far away puts it back.
- `arrow-follow-note` moving a note keeps each end at the same spot on its border, live for a viewer too.
- `arrow-two-lines` A→B and B→A are two separate lines with their own heads.
- `arrow-colour` with an arrow selected, the toolbar swatches show its colour and recolour it. Default is the source note's colour.
- `arrow-delete` click an arrow, press Delete: gone for everyone. Deleting a note removes its arrows.
- `arrow-copy` Ctrl/Cmd+C then V, or Ctrl/Cmd+D, of A and B together gives A′→B′ with the same anchors and colour; arrows to notes outside the selection are dropped.
- `arrow-visitor` a visitor sees the arrows but has no Arrow tool, no nub, no handles; the server returns 403 to their create, patch or delete.
- `arrow-private` an arrow to a private note is never sent to a visitor, on load or over the WebSocket.
- `arrow-channel` channel boards show no Arrow tool and no nub; the arrow routes return 404.

## How to get to it (user POV)

- On your own board (`/`), click the arrow icon in the top toolbar (or press `A`) and drag from one note onto another.
- Or hover a note, grab the small circle on its edge and drag it onto another note.
- Hover an arrow to see its end handles. Click it to select it, then press Delete, or pick a swatch to recolour it.
- The shortcuts dialog (`?`) lists "Arrow tool".

## Driving it with claude-in-chrome

Preconditions: two accounts, `alice` (owner) and `bob` (visitor), each in their own tab. The tabs share one cookie jar, so log bob in by `fetch('/api/login', ...)` in the second tab only after you've finished with alice, or use a second Chrome profile. Alice's board has four notes, one of them private (`POST /api/boards/<id>/notes` with `visibility: "private"`).

- **Tool.** Click the Arrow button, `left_click_drag` from inside one note to inside another. An arrow with a filled head in the source note's colour appears. Query SQLite: `select * from note_arrows` has one row with `from_side`/`to_side` set and `from_t`/`to_t` between 0 and 1.
- **Snap to each side.** Drag so the release point is above, below, left and right of a note (within 36px, or inside it). Each time the head lands on the border facing the release point.
- **Nub.** `Escape`, hover a note near its top edge, then near its left edge: the nub sits on that edge. Drag the nub onto another note.
- **Move an end.** `hover` the arrow, `left_click_drag` an end handle along the same note's border, then onto a third note. Query SQLite: `to_note` and `to_side` changed.
- **Cancel.** Drag an end to empty board: it goes back.
- **Move a note.** Drag a connected note: both arrow ends stay at the same border spot.
- **Recolour.** Click the arrow, click the orange swatch: the line tints orange. SQLite `color` reads `orange`. Reload: still orange.
- **Delete.** Click the arrow, press Delete. SQLite row gone. Delete a note: its arrows vanish and no rows reference it.
- **Copy.** Select A and B (shift-click), Ctrl/Cmd+D: the copies get their own arrow with the same anchors and colour; a third note's arrow to A is not copied.
- **Visitor.** In bob's tab open `/alice`: the toolbar has no Arrow button, hovering a note shows no nub, hovering an arrow shows no handles, and the arrow to the private note is absent. Screenshot this. `fetch('/api/arrows/<id>', {method:'DELETE'})` returns 403.
- **Live.** With bob's tab open on `/alice` in a second window, draw, recolour and delete as alice: bob's tab updates with no reload. Cover cross-user delivery with `spec/arrows.test.ts` where a second cookie jar is not available.

## Gotchas

- Hover-only controls need a real `hover` first. A click-drag that starts on a hidden nub still grabs it, but a handle only exists while the arrow is hovered.
- Arrow hit width is about 14px; aim at the line, not near it.
- The Arrow tool turns off note dragging, so use `V` (or Esc) before moving a note.
- Two arrows ending at the same border point overlap; they are not spread out.
- Drawing is desktop only: on touch the nub is hidden and the tool does nothing, but arrows still render.
- `Backspace`/`Delete` remove a selected arrow first, so deselect (Esc) before deleting notes.
