---
title: Your status on a note
order: 4
idea: note-status
summary: Say you're on a note or done with it, without leaving the board. Only you see your own status.
image: feature-status.webp
---

# Your status on a note

A lot of post-its are to-dos. Each person sets their own status on a note: nothing, on progress, or done. It says how far along you are without turning Post-its into a project manager.

## How to use it

1. Select a note.
2. Press **S** to step your status forward: none → on progress → done.
3. Press **Shift+S** (or Shift-click the **Status** button in the bottom bar) to step back.
4. Or use the **on progress** and **done** buttons in the note's sidebar. See [Note details sidebar](/docs/features/note-sidebar/).

## Good to know

- Your status shows in the note's footer, and only to you. The note's creator can see who is on it in the sidebar.
- No status shows nothing on the note.

## Checked by

- `spec/note-side.test.ts`: status is per person, clears with none, and syncs live.
