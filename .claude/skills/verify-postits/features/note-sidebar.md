# Note sidebar (back side)

Every note has a header strip (its corner button, plus "You" or "by <name>"), text, and a footer (your status, labels). The corner button opens a right-hand sidebar (a bottom sheet under 700 px) with Proof, Who's on it and Comments. Status is per person: none (shows nothing), on progress, done. `S` / `Shift+S` and the bottom-bar Status button step your own status none → on progress → done (the ends stop and flash a message).

## Sub-features

- `side-open` the corner button opens it; clicking or dragging the note body never does. Another note's button switches; Esc or a click on empty canvas closes. Animated; reduced-motion respected.
- `side-proof` only the creator can tick (checkbox disabled for others, 403 from the API, channels too). The button turns green ✓ in every open tab with no reload.
- `side-status` "on progress" / "done" buttons; tapping the selected one clears it. The footer shows only your own.
- `side-people` the creator sees Done / On progress rows of true-circle initials, most recent first, `+N` expands a scrollable name list, tapping a circle shows name and time under that row. Others see counts only ("1 done · 1 on progress").
- `side-comments` live in two tabs; only the author edits; author or board owner deletes. Only the list scrolls, opens at the newest, input pinned at the bottom.
- `side-private` a private note's side is 404 to visitors and sends them nothing.
- `side-keys` `S` / `Shift+S` / Status button follow the same three states; no "to do" anywhere.

## Driving it (claude-in-chrome)

Seed three users (alice owns the board, bob, carol; sign up through `/api/signup` on `$VERIFY_SERVER_PORT`) and create notes by API: one by alice, one by bob on alice's board, one alice note with 50 comments (`POST /api/notes/<id>/comments`), one with 40 done and 25 on progress (sign up 65 users, `PUT /api/notes/<id>/status`).

- **Open.** As alice at `/`, click a note's corner button: the sidebar slides in. Click another note's button: it switches. `Escape` closes. Drag a note by its body: no sidebar.
- **Proof, two tabs.** Open alice in two tabs, tick proof in one: the other shows the green ✓ within a second. Untick: it goes back.
- **Counts vs names.** As bob on `/alice`, open the note bob set done: counts only, no names, checkbox disabled. As alice: Done and On progress rows with initials.
- **Crowd.** On the 40/25 note as alice: each row is one line with `+N`; `+N` shows a scrollable list (≤170 px) with "Show less"; comments and input stay on screen.
- **50 comments.** Only the list scrolls; it opens at the newest; the top fades under "Comments".
- **Phone.** Resize to 390 px wide: bottom sheet, corner button ≥ 44 px (touch emulation).
- **Persisted.** `select * from note_status`, `select proof from notes`, `select * from note_comments` match; reload keeps everything.

## Gotchas

- Both MCP tabs share one cookie jar, so a second tab is the same user; use it for live sync, and `spec/note-side.test.ts` for cross-user delivery.
- The creator's quiet dot shows only on the creator's own copy, when someone is done and proof isn't ticked.
- `PATCH /api/notes/:id` with `status` returns 400; status is `PUT /api/notes/:id/status`.
