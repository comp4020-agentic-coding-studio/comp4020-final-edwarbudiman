# Live cursors and presence

Live cursors and presence let a user see who else is on their board in real time, see their cursor move, and follow them.

## Sub-features

- `presence-list` shows who else is currently on a board.
- `cursor-live` shows another user's cursor position updating live.
- `cursor-follow` locks the viewport to follow another user's position.

## How to get to it (user POV)

- Have a second person open the same board URL (`/` for its owner, `/<username>` for anyone else) while you're on it.
- Look at `role="group" aria-label="People on this board"` to see who's present.
- Click a person's avatar/cursor to follow them; `role="status"` shows the follow state; `button "Step back into the room (M)"` or similar exits follow.

## Driving it with claude-in-chrome

Preconditions:

- Two MCP tabs, logged in separately: tab A as `demo1`, tab B as `demo2`.
- Both tabs navigate to the same board: `demo1`'s own board is `/` for tab A, and `/demo1` for tab B.

- **Presence.** On tab B (viewing `/demo1`), `read_page` or screenshot shows `demo1` listed in the "People on this board" group once tab A is also on that board.
- **Live cursor.** On tab A, `computer` move the mouse to a specific canvas point (e.g. `hover` at `[600, 300]`). On tab B, `read_page`/screenshot within ~1-2s shows a cursor indicator near the corresponding canvas position labeled for `demo1`.
- **Follow.** On tab B, click `demo1`'s cursor/avatar indicator. A `role="status"` follow chip appears on tab B. Pan or move on tab A; tab B's viewport shifts to track it.
- **Proof.** Screenshot from tab B showing the live cursor/follow state, timestamped close to the action on tab A (note the wall-clock time of each screenshot in your report so the "live" claim is checkable).

## Gotchas

- Presence and cursor messages are WebSocket-only (`server/src/realtime.ts`) — there's no REST endpoint to poll as a secondary proof; the only way to verify is the second tab's own rendered state.
- A `computer hover` with no prior click may not register as board "focus" in some browsers; if tab B shows no cursor update, try a small click-drag pan on tab A first to force a position broadcast.
- This feature was mapped from the WebSocket message-type survey (`join`, `presence`, `cursor`, `cursor:leave`) and from ARIA labels found via static inspection, not yet driven end-to-end in this skill's proving run. Drive it fully (two real tabs) before relying on it, and correct this file if any selector or behavior differs.
