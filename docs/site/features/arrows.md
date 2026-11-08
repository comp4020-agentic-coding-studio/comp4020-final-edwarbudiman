---
title: Arrows between notes
order: 7
idea: note-arrows
summary: Draw a one-way arrow from one note to another to show what leads to what.
image: feature-arrows.png
---

# Arrows between notes

Sometimes position isn't enough, and one note leads to another ("buy paint" → "paint the fence"). Arrows show that without turning the board into a diagram tool.

## How to use it

1. Press **A** (arrow tool), or grab the small handle on a note.
2. Drag from one note onto another. The arrow end snaps to the target note.
3. Move either note and the arrow follows.
4. Press **Esc** to leave the arrow tool.

## Good to know

Only the board's owner can draw arrows on their own board.

## Checked by

- `spec/arrows.test.ts`: owner-only, one-way, and arrows are removed when either note is deleted.

Built through the agent pipeline: research → decide → three spikes → build → review. See [Pipeline](/docs/pipeline/).
