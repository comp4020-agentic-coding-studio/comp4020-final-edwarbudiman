# Decision: label-sections

Short decide (small idea): one shapes table, then four questions, each with a recommended default. 2026-11-09.

## Picked

**B. Zones.** A **Section** tool in the board toolbar, next to Arrow: drag a rectangle and type a name. A section is a soft-tinted named rectangle drawn behind the notes, with its name on the top edge. It is only a backdrop: moving or resizing it never moves notes. A note belongs to the section that contains its centre. **Membership is computed from position and never stored.** Sections can't overlap: a section moved or resized onto another one snaps back to where it was. The label filter becomes a **section filter**. Pick one or more sections, and every note outside them fades and can't be selected, through the same `shown()` path. A note created or pasted while filtering lands inside the first filtered section, which replaces label stamping. Per-note labels go away entirely: the chips on the note face, the Label button (L) and the label editing UI. The `labels` column stays in the DB, unused, and existing labels are not converted. On your own board only you can create, rename, move, resize or delete sections. On a channel board any member can. Visitors see sections and can filter by them. Sections sync live and survive a reload, the same way arrows do (a table, REST plus a WS relay).

## Why

- Taken from the seed: notes "already carry too much (header, text, status footer, sidebar)", so labels should leave the note and grouping should come from where a note sits.
- The owner picked every recommended default except overlap: B over A (no permission problem with carrying notes you don't own), drop old labels, owner and members edit.
- No overlap: the owner chose clear membership (one note, one section) over the freedom to nest.

## Not picked

- **A. Live sections (carry notes on drag).** It raises the question of a visitor's section carrying notes the visitor can't move, and it adds a batch move through the drag lock. Not rejected: the spike tests whether its absence feels broken, and it can be added later just for the notes you're allowed to move.
- **C. Hide label chips, keep labels.** It doesn't do what the seed asks (remove labels). Not now, not rejected.
- **Convert labels to sections.** Extra work, and the result looks messy when a label's notes are spread out. Labels are dropped.
- **Nested or overlapping sections.** The owner wants one note in one section.

## It works if

1. On your own board, choosing the Section tool and dragging a rectangle makes a named section behind the notes. A second browser sees it straight away, and it's still there after a reload.
2. Moving or resizing a section never moves a note. Dragging or resizing a section onto another one snaps it back, so sections never overlap.
3. Filtering by a section fades every note whose centre is outside it, and those notes can't be selected. A note made with double-click while the filter is on lands inside that section and stays visible.
4. Notes show no label chips, and there is no Label button or `L` shortcut. Notes that had labels before still load and show nothing extra.
5. A visitor on someone else's board can't create, move, rename or delete a section there: the UI offers no way to, and the server rejects the attempt. A channel member can do all of these on the channel board.

## Spike question

When you drag a zone with notes in it and the notes stay put, does that feel right ("the area is just a place"), or broken ("I wanted my group to come with it")? And does filtering by a section feel like a fair replacement for filtering by label?

## Open questions

- Section colour: one neutral tint, or the same swatches as notes? The spiker picks one, and the owner judges it in the spike.
- Delete: deleting a section deletes only the area, never the notes. This is assumed, not asked.
- Build order: the migration has to be numbered after note-sidebar's migration 7, so build after note-sidebar is merged.
