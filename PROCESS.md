# Process overview

<!-- DRAFT assembled by the agent from the planning session's decisions.
     Rewrite it in your own words before the crit 8 cutoff (task T27): the
     brief warns that a PROCESS.md that reads like an agent's tells the marker
     you've added little. Each "Edward:" comment marks something only you can
     say. Delete these comments as you go. -->

_Where this stands: Tuesday 6 October, the evening before the crit 8 cutoff.
Nothing is built yet; this describes how the plan was made._

## From the brief to a plan

I started the project by grounding the agent in the course rather than in its
memory. The COMP4020 skills pulled the final-project brief, the specs for
crits 8–10 and my crit group's cutoffs straight from the course site. That
caught the first mistake early: with no crit group set, the deadline script
reported crit 8 as already past. Once the group was set to Baishi, the real
cutoff turned out to be Wednesday 07:00, and the plan was rescoped around it.

My first idea was a shared post-it board: accounts, personal boards, channels
and chat, with FigJam-style dragging and live cursors. The agent pushed back
that, listed like that, it's close to the "median answer" the brief warns
about. I kept the core and tied each feature to a reason:

- **Co-presence:** being on a board while other people are there makes it
  less lonely, and if you can't reach someone in a channel you can hop to
  their board and leave them a note.
- **Prioritising by placement:** an infinite canvas where where a note sits
  *is* its priority and category, with colour as a second axis.
- **What I left out:** polls, drawing and stickers. The post-it is the core.

<!-- Edward: why these reasons, in your words; what you read or looked at
     (Sloan, Shirky, Figma's multiplayer post, local-first...) and what you
     took from each. -->

The decisions that shape the build, all recorded in the backlog
([`a0ca454`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-edwarbudiman/commit/a0ca454)):

- **Email is optional.** Password reset by email needs a sending domain, and a
  `*.fly.dev` app doesn't own one. So an account without an email can't be
  recovered, and sign-up says so.
- **Privacy is per note, not per board.** A private note on my board is only
  mine. A private note I leave on someone else's board is visible to me and
  to them.
- **Only a note's author or the board's owner can move or delete it** on a
  user board. On a channel board, everyone can edit.
- **Two people grabbing one note:** the first holder wins and the note is
  locked until they let go.
- **Anonymous people still appear,** as a nameless cursor.
- **Channel chat is held by the people in the room, not the server.** My
  reason was memory: a 256 MB machine shouldn't hold everyone's chat. The
  agent added an HMAC on each message, so the server can check relayed
  history isn't forged without keeping a copy. The consequence is that a
  message lives only as long as someone who saw it is still in the room.

<!-- Edward: which of these you're least sure about, and why. -->

## The stack, as a first choice

Node 24 and TypeScript on the server, React and Vite for the client, and
SQLite on the Fly volume through Node's built-in `node:sqlite`. The course
fixes one small machine (256 MB) and one volume, so the questions were what
fits and what has the fewest moving parts. I compared `node:sqlite`,
`better-sqlite3`, libSQL, `sql.js`, Bun's SQLite and a plain JSON file.
`node:sqlite` won because it needs nothing compiled in the Docker image. Its
cost is that it's still experimental: it prints a warning, and its API could
change. Pinning the Node version in the image contains that risk. Proper
decision records for the stack and the driver come with the first build
(tasks T15 and ADR-0001/0002).

<!-- Edward: why React rather than plain TypeScript; what you used in A2 or
     crit 7 and what you wanted to keep or move away from. -->

## How I'm working with the agent

- **Planning is separate from building.** This session only produced the
  backlog. Implementation runs in a fresh session that starts from
  `docs/backlog.md`, so the plan, not a long chat, is the handoff.
- **The backlog marks who writes what.** `[me]` items (README, this file,
  reflections) are mine to draft; `[agent]` items are built with the agent.
- **The work is cut into checkpoints, each shippable.** If time runs out
  before 07:00, I ship the last green checkpoint instead of a half-finished
  one. Crit 8 only needs checkpoint A.

## Open issues

- With my local token, Fly reports that no app named
  `comp4020-final-edwarbudiman` exists. CI deploys with the course's token
  once the repo is public, but if the app really is missing, that deploy will
  fail at the cutoff. I've raised it on Ed.
  <!-- Edward: confirm you did, or change this line. -->
- `CLAUDE.md` currently holds instructions for loading the course skills into
  my agent harness, not the project's rules. Task T01 splits them before the
  repo goes public.
