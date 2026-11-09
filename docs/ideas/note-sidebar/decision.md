# Decision: note-sidebar

Decided 2026-11-09 by the owner in the lead's decide conversation.

## Picked

Shape B from `research.md`, reshaped by the owner. Each note gets a right-hand sidebar (a bottom sheet on phones), opened from a **button on the note**, not by clicking the note. The sidebar has three parts:

1. **Proof**: one checkbox per note that means "the creator confirms the finish criteria are met". Only the note's creator can tick or untick it, on every board, channels included. It isn't tied to status.
2. **Who's on it**: status is now **per user**, with three states: **none** (shows nothing on the note), **on progress**, **done**. Everyone who can see a note sets their own status, and the board shows each person their own. In the sidebar the creator sees who: rows of initials in circles, most recent first. Tapping a circle shows the name and when they set it, and `+N` expands the row to full names. Everyone else sees only counts, for example `2 done · 1 doing`, next to their own status.
3. **Comments**: plain text, newest at the bottom, names shown. Anyone who can see the note can comment. People edit or delete only their own comments, and the board owner can delete any comment.

The note's corner shows ✓ when proof is ticked and 💬 with a number when there are comments. On their own notes, the creator also gets a quiet dot when someone has said done and proof isn't ticked yet. Everything syncs live to everyone viewing the board, so nobody has to reload, and it's all still there after a reload.

**Sidebar layout (from spike-1 taste):** top to bottom: note text, Proof, Who's on it (all fixed), then Comments, the only part that scrolls, with the newest comment at the bottom next to the input, like a live chat, and the input pinned to the very bottom. Opening, closing and switching the sidebar are animated so it feels fluid.

**Open button (from spike-1 taste):** clearly visible at all times, and designed as part of the note itself, "blend and like a window, but on the corner has button". It shows ✓ in place of its symbol when proof is ticked. Private notes keep their status, proof and comments private. Existing statuses are wiped when this ships.

## Why

- "I want comment section so it will look lively."
- Per-user status: "it will help to understand, each user who starting this post-it task, and it can notify the creator of the post-it to see who finished the post-it and check it, then they can checkmark it."
- Who's working on a note is anonymous for everyone except the creator: "it doesnt matter who is starting or who is finishing. This who only important for the creator of the post-it, especially when it's finished."
- Proof is one checkbox, not text or images: "only the creator of post-it can check then tick whether the post-it criteria of finished already done."
- Spam remedy: the board owner deletes the note, which they can already do.
- A button, not a click: "opening sidebar with click somehow it also affect when im trying to move it around … it has some button for opening the sidebar. also consider the mobile version."

## Not picked

- **A (text or image proof):** proof became a checkbox, so no upload route or image storage is needed.
- **C (one timeline with pinned proof):** the owner wants proof and comments as separate sections.
- **Proof per finisher:** the owner wants one tick per note, not one per person.
- **Opening the sidebar on a still click:** the owner found it clashes with moving notes.

## Parked (in `docs/rejected.md`)

- `proof-rewards`: the more of your notes have proof ticked, the more benefit you get.
- `done-notifications`: tell the creator when someone sets their note to done, and make it quieter once proof is ticked. The creator's quiet dot is the only nudge in this idea.

## It works if

1. User A creates a note on B's board. B sets it to `done` and C sets it to `on progress`. A's sidebar shows `done` and `on progress` rows, each with an initial in a circle. B's sidebar shows only B's own `done` plus the counts. Each person's board shows only their own status.
2. Only A can tick proof, on any board including channels. When A ticks it, everyone viewing the board sees ✓ on the note within a second, with no reload, and it's still there after a reload. A can untick it.
3. Anyone who can see the note can comment. People edit or delete only their own comments, and the board owner can delete any comment. Comments sync live and stay private on private notes.
4. The note's button opens the sidebar. Clicking or dragging the note itself never opens it. With the sidebar open, clicking another note's button switches to that note. Esc or clicking empty canvas closes the sidebar. On a phone the button is easy to tap and the sidebar opens as a bottom sheet.
5. Existing statuses are wiped by a migration, and `pnpm check` passes.
6. With 50 comments on a note, only the comments list scrolls. It opens at the newest comment, which sits just above the input pinned at the bottom, and the note text, proof and who's-on-it stay in place.

## Spike question

Round 2 (after spike-1 taste): does a clearly visible open button, built into the note like a window with a button in its corner, feel like part of the note and stay out of the way of dragging, on desktop and on a phone? Does the animated sidebar, with only the comments scrolling (live-chat order, input pinned at the bottom), hold up with many comments? Proof must sync live between two tabs, even in the spike.

## Open questions

- The exact look of the window-style button. Spike-2 and `/taste` settle this.
- Whether the status filter uses your own status only (assumed yes).
