# No cap on how many channels a person can join

**Status:** accepted for now (demo stage) · **Recorded:** 16 Oct 2026 · **Area:** sidebar, channels, real-time

## The decision

Anyone can join as many channels as they like. The sidebar lists every
channel you're in, with an unread count on each, and there is no limit on
memberships.

This is fine while Post-its is a demo for the crits and a handful of testers.
We are deliberately **not** worrying about server cost or load yet. This note
records what we skipped and when it would start to matter.

## What Discord does, and why

Discord limits how many *servers* an account can be in (around 100, more with
Nitro). It doesn't limit channels within a server. As far as we can tell, the
reasons are:

1. **Startup cost.** When the app connects, it loads every server you're in:
   channels, roles, member lists, unread state. Each membership makes every
   login and reconnect heavier.
2. **Fan-out.** Every message in every server you're in has to be checked and
   possibly delivered to you live. More memberships per person means more work
   per message across the whole system.
3. **Abuse.** Bot and spam accounts join huge numbers of servers to scrape
   member lists or send spam DMs. A cap is a cheap brake on that.
4. **Usability.** Past roughly 100 entries, a sidebar stops being something a
   person can scan.

## The same costs here

We pay smaller versions of the first three.

| Cost | Where it lives | What it does today |
| --- | --- | --- |
| Loading the sidebar | `sidebar()` in `server/src/boards.ts` (`GET /api/sidebar`) | One query per load, with a subquery that counts unread notes for each channel you're in (and each person you've visited). Runs on every board change, after `activity` nudges, and every 60 s in a visible tab. |
| Fan-out on a new note | `activity()` in `server/src/realtime.ts` | For every new note, looks up everyone who has that board in their sidebar (`board_seen`), then loops over all open sockets to nudge them. Each nudge makes that client reload its sidebar. |
| Abuse | `joinChannel` / `channelBoard` | Nothing stops a script from joining every public channel. |

All of this runs on one 256 MB Fly machine with SQLite, which is fine at class
size.

## When to come back to this

Any of these is the signal:

- `GET /api/sidebar` regularly takes more than ~50 ms, or shows up in the
  stats page / `flyctl logs` as a hot path.
- A single busy channel produces a burst of sidebar reloads (many members,
  many notes a minute).
- Someone abuses joining (one account in an unusual number of channels).
- `fixed-idea.md` §12 ("Growing against the server") gets to busier halls; the
  same measuring script should cover sidebar load.

## Options when we do

Cheapest first:

1. **Send the count, not a nudge.** Have `activity` carry the new unread count
   (or "+1") so clients update in place instead of reloading the whole
   sidebar.
2. **Cache unread counts** in a `board_seen.unread` column, bumped on insert
   and reset on open, instead of counting notes on every load.
3. **Index for the fan-out lookup:** `board_seen(board_id)`. The primary key
   is `(user_id, board_id)`, so lookups by board alone scan the table.
4. **Rate-limit joins** per account (e.g. N per hour), like the login limit
   in `auth.ts`.
5. **A soft cap** on memberships (Discord-style), only if the above isn't
   enough. If we add one, make it high and explain it in the UI.
