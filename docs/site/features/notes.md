---
title: Notes on your board
order: 1
summary: Double-click anywhere to put a post-it there. Where it sits is how you prioritise it.
image: feature-notes.png
---

# Notes on your board

Your board is the first thing you see after logging in, with no dashboard in between. A note is a short post-it of up to 280 characters in one of a few colours. Notes are a fixed size, so the board stays easy to read. Where you put a note is the point: close to the top means urgent, a cluster means "these go together".

## How to use it

1. **Add a note:** double-click an empty spot, or press **N** (the note button in the toolbar).
2. **Write:** type, then press **Enter** to save. Double-click a note (or select it and press **Enter**) to edit it again.
3. **Move it:** drag it. On a phone, long-press and then drag.
4. **Colour, duplicate, delete:** select the note and use the small bar above it. **⌘D / Ctrl+D** duplicates, and **Delete** or **Backspace** removes.
5. **Get around:** hold **Space** or press **H** to pan. **+**, **−** and **0** zoom, and **Shift+1** shows every note.

## Who can do what

- On your own board, you can edit and move any note.
- On someone else's board (`/<username>`), you can leave a note and edit or move only your own.
- A note can be public or private. Private notes are only for you.

## Checked by

- `spec/notes.test.ts`: notes are created, moved and edited through the API, and visitors can't move other people's notes.
- `spec/invariants.test.ts`: notes are still there after a server restart.
