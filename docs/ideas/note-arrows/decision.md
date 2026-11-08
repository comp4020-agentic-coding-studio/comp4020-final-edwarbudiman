# Decision: note-arrows

Decided 2026-11-05 with the owner (round 1).

## Picked

Shape A: plain, untyped arrows between notes that say "this note affects that note". Only the board's owner can create or delete arrows, and only on their own board. Channel boards get no arrows in v1. Visitors see the owner's arrows read-only and live, but only arrows whose two notes they can see, so an arrow never gives away a private note.

How you draw one:

- **Arrow tool** in the top toolbar, next to Hand, Select, Note and the colours (shortcut `A`). While it's on, dragging from note A onto note B draws A→B. The tool stays on until Esc, `V` or another tool is picked. Notes don't move while it's on, and dragging on empty board pans.
- **Hover nub.** In Select mode, a small connect nub appears on a note's right edge when you hover the note or select it, on your own board only. Drag the nub onto another note to draw the arrow.

Drawing is desktop only in v1. Arrows still show on phones.

What it looks like: a thin straight line from the centre of one note to the centre of the other, cut off at the note edges and drawn under the notes. The line is neutral grey, with a small arrowhead at the target end in the source note's colour. The re-style is limited to the arrow and its nub; the note's paper and footer don't change.

Rules: an arrow goes one way. Dragging A→B again does nothing, and an arrow from a note to itself isn't allowed. A→B and B→A can both exist. Click an arrow and press Delete to remove it. Deleting either note deletes its arrows. Copying and pasting, or duplicating, a selection brings along the arrows between the copied notes, and drops arrows to notes outside it.

## Why

- "This is just a simple arrow, that can tell from this post-its can be effecting to another post-it." The note text says the rest.
- "I only want the arrow to be managed by the user of the board. Different with channel, in channel we dont need that arrow for now."
- Visitors should still see why notes sit where they are, so arrows are visible to them read-only.
- Arrows are for what position can't say. The owner expects a handful per board, not dozens.
- The owner wants both a toolbar tool and the hover nub: the tool for drawing several arrows in a row, and the nub for a quick one-off arrow.

## Not picked

- **B. Status-aware "blocked by".** The owner picked A. It drifts toward a project manager, and it would mark notes as blocked when an arrow only means "affects".
- **C. Lines only on demand.** The seed wants the board to *show* the order, and hidden lines lose that, especially for visitors. Busy channel boards were the main case for C, and channels have no arrows now.
- **Off limits in v1:** arrow labels, types, colours or style pickers, curved or routed lines, arrows not attached to notes, arrows on channel boards, and visitors drawing arrows.

## It works if

1. On my own board, I drag from note A onto note B, with the Arrow tool or with A's hover nub, and an arrow A→B appears. A second viewer sees it live, and it's still there after a reload.
2. When I drag A or B, the arrow follows live for me and for the viewer.
3. I click the arrow and press Delete and it's gone for everyone. Deleting A removes all of A's arrows.
4. A visitor on my board sees my arrows but has no Arrow tool and no nub, and the server rejects a create or delete from them. An arrow to one of my private notes is invisible to them. Channel boards show no Arrow tool and no nub.
5. When I copy and paste or duplicate A and B together, the copies have their own A′→B′ arrow. The API specs for arrows (create, delete, permissions, privacy, cascade) pass in `pnpm check`.

## Spike question

Does dragging a few arrows between my notes make the board say "this affects that" more clearly, without it starting to look like a diagram?

## Open questions

- **Causality sidebar.** The owner floated clicking an arrow to open a right-hand panel that explains the cause. It's left out of v1, and the spike decides: if the owner keeps wanting to write *why*, it comes back as its own idea, possibly as part of the note-details sidebar in `more-ideas.md`.
- **Drawing on phones** (with the nub or the tool) is a follow-up.
- **Arrows on channel boards** are "not for now", not rejected.
- **A show/hide arrows toggle** (C's fallback) is worth revisiting if the spike shows clutter.

## Changed after the spikes

Settled with the owner through `/taste` on spikes 1–3 and the spike-3 tweaks (root `docs/taste.md`, 2026-11-05). These override the lines above.

- **Nub on four sides.** It appears on whichever edge (top, right, bottom or left) the mouse is nearest, measured from the note's centre, and shows on hover only.
- **Magnetic, movable ends.** No longer centre to centre. While you draw or drag, an end follows the mouse and snaps to the nearest point on any edge of a nearby note. Each end's spot (side plus position along it) is saved, so it stays put when the note moves. Hovering an arrow shows a handle on each end, which you can drag to move it or re-target it to another note.
- **A→B and B→A are two separate lines**, each with its own head.
- **Arrow colour.** With an arrow selected, the toolbar swatches recolour it. The default is still the source note's colour. This replaces "no colours" in the off-limits list. The owner asked for it in a spike tweak.
- **Saved in the database**, never in localStorage.
