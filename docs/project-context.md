# Project context

The one page every agent reads before working on an idea. It says what Post-its is, who it's for, what exists, and what limits any idea must fit. Longer sources are linked at the end; read them only when an idea touches them. The owner keeps this page current. Agents may suggest edits in their report, never make them.

## What Post-its is

A board for your notes. Messages and to-do lists end up scattered, so you put them on a board as post-its, wherever you like: **where a note sits is how you prioritise and group it**. Other people can visit your board and leave you a note, and when they're there at the same time you see their cursor, so it feels less lonely.

- **For:** one person organising their own notes, plus the few people who drop by their board or share a channel with them. Not a team whiteboard, not a diagram tool.
- **Thesis:** position is meaning, and co-presence makes it less lonely.
- **Inspired by:** Excalidraw (how simple a canvas can be: white, minimal, small floating toolbars) and FigJam (notes placed freely, position means something).
- **On purpose, not in it:** polls, drawing, stickers, reactions. "No dashboard and nothing in the way: you open it and you're on your board."

## What good means (from README.md)

1. **Fully functional.** Log in, land on your board, add, move and label notes, and they're still there when you come back.
2. **Not hard to use.** Double-click to add or edit, drag to move, select several and copy or paste.
3. **People give good feedback** when the owner watches them use it (pod crits, real users).

## What exists today

- Your own board at `/`, someone else's at `/<username>`, and shared channel boards.
- Notes: plain text up to 280 characters, one of a few colours, **fixed size**, labels with a filter, public or private, and a status (`todo → doing → done`, keys `S` / `Shift+S`).
- Select by box or Shift-click, drag, copy and paste, duplicate, arrow keys to move, long-press drag on phones.
- Live cursors and presence over WebSockets, click someone to follow them, an anonymous setting, and a drag lock (first holder wins).
- Channels: public, or private with a key. Channel chat is held by peers only; the server stores none.
- A `/stats` page, structured action logs, socket reconnect, and an optional 3D view toggle (from the parked direction).

## How it's built

- **Server:** Node 24 and TypeScript in one process, `ws` for WebSockets, SQLite through `node:sqlite` with plain SQL (`server/src/db.ts` has the schema as numbered migrations). The server is the source of truth and relays changes to a room per board.
- **Client:** React and Vite. The canvas is in `client/src/pages/Board.tsx`, and styles are in `client/src/styles.css`.
- **Tests:** `pnpm check` (typecheck and vitest specs that drive the HTTP and WebSocket API). The `verify-postits` skill drives the real app in Chrome.
- **Deploy:** one Fly.io machine, `shared-cpu-1x` with **256 MB** of memory. Anything new must fit that, with no extra services and no hosted AI inference.

## Limits every idea must respect

- The thesis above. An idea that turns Post-its into a different product (a diagram tool, a project manager, a game) needs to say why, or it goes in `docs/rejected.md`.
- Simplicity: no new screens or dashboards without a strong reason. A feature should feel like part of the board.
- Real time: anything on a board must sync live to everyone viewing it and survive a reload.
- Permissions: a visitor on your board can only edit or move their own notes. Channel members can edit any note. New features follow the same rules.
- 256 MB, one process, SQLite.

## Where the direction stands

- **Planned spine** (`fixed-idea.md`, `docs/backlog.md` §4a): read-only MCP triage server for a user's own agent (`docs/adr/0001-mcp-triage-server.md`), agent-discoverability polish, offline single-player. None of it is built.
- **Parked:** the 3D world and the job board (`docs/rejected.md`).
- **The owner's taste:** `docs/taste.md`. **Dropped ideas:** `docs/rejected.md`.

## Longer sources

| File | Read when |
|---|---|
| `README.md` | always worth a skim, it's the owner's voice |
| `docs/backlog.md` §1–3 | the idea touches permissions, schema or WebSocket messages (it lags the code, so check the code too) |
| `fixed-idea.md` (top section only) | the idea relates to the planned spine |
| `more-ideas.md` | the idea might overlap the parked world. Its last lines are fresh ideas from the owner |
| `PROCESS.md`, `reflections/` | you need how past decisions were made |
