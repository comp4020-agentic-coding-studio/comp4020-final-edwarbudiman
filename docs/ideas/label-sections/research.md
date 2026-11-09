# Research: label-sections

Light research, as the owner asked: a handful of sources, then shapes.

## Question

Post-its' thesis is that **position is meaning**. Labels are the one way of grouping notes that ignores position: each note gets a tag, and the tag is drawn on the note. Can named areas of the board ("sections") take over what labels do (grouping, filtering, stamping new notes) so the note face gets lighter?

## What people say

**Area-based grouping gives a note one group, and some people want more.**
- On FigJam, which has sections but no tags: "Sometimes 1 Sticky could be affected to 2 different groups/sections." "I would like to be able to affect the same sticky to 2 things might be with a global tag system" ([Figma forum, Tags in sticky-notes](https://forum.figma.com/suggest-a-feature-11/tags-in-sticky-notes-28388)).
- "even more powerful toward collaboration is if they were searchable and filterable", "You should also be able to pull and group notes under their tag name", "This is already a feature that Miro supports natively" ([Figma forum, Tagging Sticky Notes](https://forum.figma.com/suggest-a-feature-11/feature-request-tagging-sticky-notes-in-figjam-9099)). These are user-research teams doing affinity mapping, which is not Post-its' audience. Still, the filter is the part worth keeping.

**When membership comes from position, it breaks in ways people don't see coming.**
- Miro: "I cannot **for the life of me** get frames to pick up the objects within them so that I can move them all together", and "it is as though the outer frame doesn't always "capture" and "internalize" the inner frames/elements... Very frustrating." ([Miro community](https://community.miro.com/ask-the-community-45/frames-not-picking-up-objects-objects-within-frames-not-moving-with-the-frame-4762)).
- Excalidraw: after dragging items from several frames, "Only one shape stays included" in its frame. Aligning items "within a frame – elements can be removed from the frame, despite staying within the bounds" ([excalidraw#6847](https://github.com/excalidraw/excalidraw/issues/6847)).
- What this means for Post-its: if membership is *stored* (Excalidraw's `frameId`), it can disagree with what the user sees. Working membership out from geometry every time avoids that whole class of bug.

Reddit: one `site:reddit.com` search found nothing on point (the results were Figma forum threads), and I didn't search further because of the light scope.

## How other apps do it

- **FigJam sections** ([help](https://help.figma.com/hc/en-us/articles/4939765379351-Organize-your-FigJam-board-with-sections)). There is a section tool in the bottom toolbar (Shift+S): click for a square, or drag a rectangle. Or select objects, then right-click and choose "Create section". The aim is to "Cluster objects together without having to group them" and "Contain objects that can be moved together around the board". An object joins by being moved into the section, or by the section being moved or resized over it. The name is edited by double-clicking it. Sections can be hidden or locked. Deleting a section deletes its contents, while Cmd+Delete deletes the section "without deleting its contents".
- **Miro frames** (the help page returned 403, so this comes from the community thread above). Frames carry their contents when moved. Objects sometimes don't attach until nudged, and nested frames were unreliable.
- **Excalidraw frames** ([excalidraw#6847](https://github.com/excalidraw/excalidraw/issues/6847)). There is a frame tool (F). "When dragging elements, they're added to the frame under cursor". Membership is stored per element (`frameId`) and goes out of sync on multi-drag, align and paste.
- **Common pattern:** a named rectangle sits *behind* the notes. It is made with a toolbar tool or from a selection, and its name is drawn on its top edge. Notes dropped inside belong to it, and moving it moves them. None of these apps uses a section as a *filter*. That would be new in Post-its, and it is how labels carry over.

## What HCI says

I tried to get Shipman & Marshall's "Formality considered harmful" (the spatial-hypertext argument that people express structure implicitly by where they place things, and resist declaring it formally). Every copy I tried failed to load: Wikipedia 404, the TAMU PDFs 404 or dead DNS, ACM 403. It isn't cited here. The argument fits this idea, because labels are a formal declaration and sections let structure come from placement. The decide step should treat that as unsourced.

## What Post-its has today

- **Data:** `notes.labels` is a JSON array of strings (migration 3, `server/src/db.ts:68`), with up to 5 labels of 24 characters each, and only a note's author may change them (`server/src/boards.ts:239-253`, `spec/notes.test.ts:60`).
- **Note face:** labels show as chips in the footer next to status, author and private (`client/src/pages/Board.tsx:2316`). This is the clutter the seed complains about.
- **Labelling:** the selection toolbar has a "Label" button (L), and `applyLabel` adds or removes a label on the selected notes you can edit (`Board.tsx:875`).
- **Filter:** the label filter is held in sessionStorage per board (`Board.tsx:225`). Notes it hides are faded and can't be selected (`shown()`, `Board.tsx:285`). A note created while filtering gets the filter's labels stamped on it, so it stays in view (`filterLabels`, `Board.tsx:287`), and paste does the same. There is an empty state that reads "No notes labelled X".
- **Toolbar:** Hand, Select, Arrow (user boards only), Note, then colour swatches (`Board.tsx:1935`). A Section tool would sit next to Arrow, the same kind of drag-to-make tool.
- **Precedent:** arrows (migration 6, `note_arrows`) are a per-board object with their own table, REST plus WebSocket relay, and author-only edit. Sections can follow the same pattern.
- **In flight:** note-sidebar (in review) adds per-user status and changes the note's aria label, which still lists labels. It also adds a migration, so a sections migration must be numbered after it lands. That means building after note-sidebar is merged.
- **Permissions to fit:** visitors may move only their own notes, channel members may move any note, and the drag lock means the first holder wins.

## Shapes

### A. Live sections (FigJam-style container)
A **Section** tool in the toolbar: drag a rectangle and type a name. There is also "Make section" on the selection toolbar, which wraps the selected notes. A section is a soft-tinted named rectangle behind the notes. **Membership is computed, never stored:** a note belongs to the section that contains its centre (the smallest one, if they overlap). Dragging a section by its title moves it together with the notes inside that you're allowed to move. Resizing it only changes which notes are inside. The label **filter becomes a section filter**: pick sections, and every note outside them fades, using the same `shown()` path. A note created while filtering lands inside the first filtered section, replacing label stamping. Labels go away: the chips, the Label button and the `labels` field in the UI. The column stays in the DB for now, and each existing label could become a section if the owner wants that.
- **For:** the owner, who groups by place and wants a cleaner note face.
- **Evidence:** this is FigJam's mechanism. Computed membership avoids the Miro and Excalidraw "fell out of the frame" bugs.
- **Cost:** medium. A new table and migration, REST and WS messages like arrows, a canvas layer, the tool and resize handles, and a filter rewrite. Moving a section has to move notes as one batch through the existing move and lock path.
- **Riskiest assumption:** that moving a section with notes in it is safe under the permissions. On someone else's board, a visitor's section could hold the owner's notes that the visitor can't move, so they would be left behind. Who may create, move or delete sections on a board needs an answer from the owner.

### B. Zones: named background areas that don't carry notes
Same tool and look as A, and the same section filter, but a section is **only a backdrop**. Moving or resizing it never moves notes; it only changes which notes count as inside. That is the honest form of "a note's group is where it sits". Moving a group means box-selecting the notes and the zone together.
- **For:** the same user, at the lowest risk.
- **Evidence:** it covers the seed's two asks (no labels on notes, and filtering still works) without the container's permission and lock problems.
- **Cost:** low to medium. Everything in A except the batch move.
- **Riskiest assumption:** that people won't expect a zone to carry its notes, as it does in FigJam and Miro. The first drag may feel broken.

### C. Labels off the note face, sections added later
Keep `labels` and the Label button, but **stop drawing chips on the note**. Labels show only in the sidebar from note-sidebar, and the filter stays as it is. Sections come as a separate idea later.
- **For:** fixing the clutter now while keeping multi-group tagging (the forum's "1 sticky, 2 groups").
- **Evidence:** the tag requests above. This is the cheapest fix for "notes already carry too much".
- **Cost:** very low, mostly client changes.
- **Riskiest assumption:** that hidden labels still get used. The seed says to *remove* labels for sections, and this shape does not do that. It is listed as the fallback only.

## Recommendation

**B, built so A can follow.** It meets the seed (labels gone, filtering by where notes sit), and computing membership from geometry avoids the frame-membership bugs in other tools. It also avoids the open question of a visitor moving notes they don't own. A spike should test the first drag: if the owner expects the zone to carry its notes, add A's carry-on-move just for notes you're allowed to move.

**For the decide step (the owner's call):** what happens to existing labels (convert each to a section, or drop them)? Can visitors draw sections on someone else's board, or only the board owner and channel members? Can sections overlap?

## Sources

- https://help.figma.com/hc/en-us/articles/4939765379351-Organize-your-FigJam-board-with-sections
- https://forum.figma.com/suggest-a-feature-11/tags-in-sticky-notes-28388
- https://forum.figma.com/suggest-a-feature-11/feature-request-tagging-sticky-notes-in-figjam-9099
- https://github.com/excalidraw/excalidraw/issues/6847
- https://community.miro.com/ask-the-community-45/frames-not-picking-up-objects-objects-within-frames-not-moving-with-the-frame-4762
- Repo: `server/src/db.ts`, `server/src/boards.ts`, `client/src/pages/Board.tsx`, `spec/notes.test.ts`, `feat/note-sidebar` diff
