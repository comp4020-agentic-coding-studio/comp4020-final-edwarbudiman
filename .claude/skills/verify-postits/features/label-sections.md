# Label sections

Sections replace per-note labels. In the toolbar, next to Arrow, the Section tool (key `G`) draws a named zone: a soft-tinted rectangle behind the notes with its name on the top edge. A note belongs to the zone holding its centre, worked out from position and never stored, so where a note sits is its group. Zones never overlap, never carry notes when moved or resized, sync live, survive a reload and are saved in the `board_sections` table. The filter button reads "Sections" and fades every note outside the ticked zones. On your own board only you write sections; on a channel board any member does; visitors see them and can filter by them. Notes show no label chips, and there is no Label button or `L` key.

## Sub-features

- `section-draw` choose the Section tool (or press `G`) and drag a rectangle (at least 120 by 90): a zone appears behind the notes at once with its name input focused. Type a name, Enter; the zone is saved then.
- `section-move` drag the name bar to move the zone. Notes inside stay where they are.
- `section-resize` drag the grip at the bottom-right corner. Notes stay put.
- `section-overlap` drawing, moving or resizing a zone onto another one snaps it back, shows a large red top-centre toast "Sections can't overlap" (about 2.8s) and flashes the snapped-back zone red for about 1s. Touching edges is allowed. The server answers 409.
- `section-rename` double-click the name, type, Enter (Esc cancels).
- `section-delete` the × on the name bar removes only the zone. Its notes stay.
- `section-filter` the `Sections` filter button lists zones with note counts. Ticking some fades the notes whose centre is outside them, and they can't be selected. Held in sessionStorage per board.
- `section-new-note` while filtering, double-clicking empty space (or pasting) puts the new note inside the first ticked zone.
- `section-visitor` on someone else's board: zones and the filter are there, no Section tool, no name-bar cursor, no ×, no grip. The server returns 403 to POST, PATCH and DELETE.
- `section-channel` on a channel board any member has all the controls.
- `section-no-labels` no chips on notes, no Label button, `L` does nothing, the note's aria label has no "labelled ...".

## How to get to it (user POV)

- Click the dashed-rectangle icon next to Arrow (or press `G`), drag over some empty board, type a name.
- Click `Sections` in the toolbar to filter. The shortcuts dialog (`?`) lists "Draw a section".

## Driving it with claude-in-chrome

Preconditions: `alice` (owner) and `bob` (visitor) in separate browser profiles or tabs (the tabs share one cookie jar, so log bob in last or use a second profile), and a channel with both as members. Alice's board has four notes, two close together at the left and two apart at the right.

- **Draw.** Press `G`, `left_click_drag` around the two left notes, type "Plan", Enter. A tinted zone with the name bar appears behind the notes. `select id, name, x, y, w, h from board_sections` has one row. Reload: it is still there. Bob's tab on `/alice` shows it with no reload.
- **Move and resize.** Drag the name bar down: the zone moves, the notes do not (`x`/`y` in `notes` unchanged). Drag the corner grip: the zone grows, notes unchanged.
- **Overlap.** Press `G`, drag a rectangle that overlaps "Plan": the red toast "Sections can't overlap" shows at the top and nothing is created. Draw a second zone on empty space, then drag its name bar onto "Plan": it snaps back, the toast shows, and it flashes red. Screenshot this within 2 seconds.
- **Filter.** Click `Sections`, tick "Plan": the notes outside it fade and can't be clicked or box-selected. Screenshot. Double-click empty space outside the zone: the new note lands inside "Plan" and is visible. Reload: the tick is remembered.
- **Rename by double-click (regression).** `left_click` twice quickly (or `double_click`) on a zone's name text: a `.section-name input` appears focused with the name selected, and `select count(*) from notes` does not change. A double-click on a name must never create a note. Do it on an owner board and on a channel board. Visitor: double-clicking a name opens no input and makes no note.
- **Early typing after a draw.** Press `G`, drag a rectangle, and at once type "Plan" then Enter (no wait): the zone is named "Plan", and `g` or other letters did not switch tools.
- **Rename and delete.** Double-click the name, type "Done", Enter: it renames for bob too. Click the ×: the zone goes, the notes remain (`select count(*) from notes` unchanged).
- **No labels.** Select a note: the bottom bar has Colour, Edit, Status, Delete but no Label. Press `L`: nothing. A note that had labels before shows no chips.
- **Visitor.** Bob's tab on `/alice`: the toolbar has no Section button, the name bars show no grab cursor, no ×, no grip, but `Sections` filters. Screenshot. `fetch('/api/boards/<id>/sections', {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({name:'x',x:0,y:0,w:200,h:150})})` returns 403, and so do PATCH and DELETE on `/api/sections/<id>`.
- **Channel.** In the channel, bob (a member) can draw, move, rename and delete a zone alice sees live.

## Gotchas

- Notes stack above zones, so a note near a zone's top edge can cover its name bar. Move the note, not the zone.
- The Section tool only starts on empty board; a drag that begins on a note moves the note.
- Zones are touch-readable but the drawing drag is desktop only.
- Filtering is client-side: faded notes still exist in SQLite.
- The overlap toast lasts under 3 seconds. Trigger it and screenshot in the same step.
