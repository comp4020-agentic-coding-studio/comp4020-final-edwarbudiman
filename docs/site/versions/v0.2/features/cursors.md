---
title: Live cursors and follow
order: 5
summary: See who else is on the board, watch their cursor, and click them to follow along.
image: feature-cursors.webp
---

# Live cursors and follow

When someone visits your board at the same time as you, you see their cursor move. This is the "less lonely" half of Post-its: you know someone is there with you.

## How to use it

1. Open a board while someone else has it open. Their avatar appears under **People on this board**, and their cursor moves on the canvas.
2. **Follow someone:** click their avatar. Your view moves with theirs until you pan or click again.
3. **Stay hidden:** turn on the anonymous setting in **Settings**. Others then see a cursor but not your name.

## How to try it alone

Log in as `demo1` in one browser window and `demo2` in an incognito window. Open `/demo1` in both.

## Checked by

- `spec/realtime.test.ts`: note changes and cursor positions reach every client in the room.
- Judged by watching pod members use it at the week 10 and 11 crits.
