---
title: Note details sidebar
order: 8
idea: note-sidebar
summary: Open a note's back side to prove it's finished, say you're on it, and talk about it.
image: note-sidebar.webp
---

# Note details sidebar

I wanted notes to feel shared without adding a new screen. Every note has a button in its top-right corner that opens a sidebar with proof, who is working on it, and comments, right next to where the note sits on your board.

## How to use it

1. Click the button in a note's top-right corner (its label is "Open note details"). The sidebar slides in from the right, or up from the bottom on a phone. Clicking or dragging the note itself never opens it.
2. Click another note's button to switch to that note. Press **Esc**, click empty canvas, or click **×** to close it.
3. Under **Proof**, the note's creator ticks "I confirm the finish criteria are met". The corner button then shows a green ✓ for everyone viewing the board.
4. Under **Who's on it**, click **on progress** or **done** for your own status. Click the selected one again to clear it. Your status shows in the note's footer, and nobody else sees it there.
5. With a note selected you can also press **S** to step your status (none, on progress, done) and **Shift+S** to step back. The **Status** button in the bottom bar does the same.
6. Under **Comments**, type in "Write a comment" and press Enter or **Send**. The newest comment sits at the bottom, just above the input, and only the list scrolls. Authors can **edit** their own comments.

## Good to know

- The creator sees who is done and who is on progress, as initials in circles, most recent first. Click a circle for the name and time, or `+N` for a full list. Everyone else sees counts only.
- Only the note's creator can tick proof, on channels too. The creator also gets a small dot on their own note when someone has said done and proof isn't ticked yet.
- Anyone who can see a note can comment. Only the author edits a comment. The author or the board owner can **delete** it. Comments are up to 500 characters.
- Private notes keep their sidebar private too: visitors can't read it and get none of its live updates.
- Everything updates live in every open tab and is still there after a reload.
- Statuses from before this feature were reset when it shipped.

## Checked by

- `spec/note-side.test.ts`: per-person status (creator sees names, others see counts), proof is creator-only on user boards and channels, live updates reach each viewer with their own summary, comment permissions, private notes stay hidden over REST and the socket, and a 200-note board loads with counts in one pass.

Built through the agent pipeline: research → decide → two spikes → build → review. See [Pipeline](/docs/pipeline/).
