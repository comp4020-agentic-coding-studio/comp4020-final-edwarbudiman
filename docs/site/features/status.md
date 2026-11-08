---
title: To-do status
order: 4
idea: note-status
summary: Move a note from todo to doing to done without leaving the board.
image: feature-status.webp
---

# To-do status

A lot of post-its are to-dos. A status lets a note say how far along it is, without turning Post-its into a project manager.

## How to use it

1. Select a note.
2. Press **S** to move it forward: todo → doing → done.
3. Press **Shift+S** (or Shift-click the status button) to move it back.

## Checked by

- `spec/status.test.ts`: status moves in order, syncs live, and survives a reload.
