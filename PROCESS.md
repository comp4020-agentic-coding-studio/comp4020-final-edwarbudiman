# Process overview

<!-- DRAFT: rewrite in your own words before the crit 8 cutoff, then delete
     this comment. -->

## Choosing the topic

I wanted a place for the messages and to-do lists that end up scattered and
cluttered: a post-it board, like FigJam, where you put notes wherever you like
and their position is how you prioritise and group them. What makes it
multi-user is that other people can come to your board and leave you a note,
and being there with them at the same time makes it feel less lonely.

## Starting the project with DeepSeek Harness

I spun the project off in DeepSeek Harness, with the COMP4020 course skills
loaded into it. Before discussing ideas, I had the agent pull the
final-project brief, the specs for crits 8–10 and my group's cutoffs from the
course site, and read the fixed parts of the repo (`fly.toml`, the
`Dockerfile`, the shipped `spec/` checks). That grounded everything after it
in the course's actual constraints rather than the agent's memory, and it
caught an early mistake: with no crit group set, the crit 8 deadline showed as
already past. Once I set my group, the real cutoff was the next morning.

## Using the agent to measure and decide

I treated the agent as something to argue with rather than something to hand
the build to:

- **It challenged the idea first.** It pointed out that, as I first listed it
  (accounts, boards, channels, chat), the app was close to the brief's "median
  answer", so I had to tie each feature to a reason or drop it.
- **It measured the options against the constraints.** For the database it
  compared six options against one 256 MB machine and one volume, and it ran
  `node:sqlite` on my local Node 24 to check that it works, finding the
  experimental warning as a cost. For real-time it weighed WebSockets, SSE
  and polling against what the app needs (live cursors mean frequent messages
  from every client).
- **I made the calls.** The agent asked structured questions with a
  recommended option, and I didn't always take it: I chose an infinite canvas
  over the recommended fixed board, and React over plain TypeScript.

The result is Node 24 and TypeScript on the server, React and Vite on the
client, SQLite through `node:sqlite` on the Fly volume, and WebSockets for
real-time.

## How the app will be built

The planning session only produced a backlog
([`a0ca454`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-edwarbudiman/commit/a0ca454)).
It records the decisions, the smallest schema, and the tasks cut into
checkpoints that can each be shipped. Each task is marked as mine or the
agent's, and the README, this file and the reflections are mine. Building
happens in a fresh session that starts from that backlog, so the plan, not a
long chat, is the handoff between sessions.

## Switching to Claude Code for the build

DeepSeek Harness spun the backlog off into a first working version: a server,
a client, and the spec checks passing. But it wasn't getting at what I
wanted. It built the backlog faithfully, including a dashboard of users and
a warm "paper" look, when what I actually had in mind was simpler: open the
app and you're on your own board, like Excalidraw, with nothing in the way.

So I spun up Claude Code with Opus and used it to give feedback on what I
wanted, rather than handing it the backlog again. I told it to forget the
pre-made design and refine the core first:

- **The look.** White and minimal, like Excalidraw. It asked me first
  whether I wanted the hand-drawn style or a clean one; I chose clean for now,
  with the note styles and font kept as tokens so I can change them later.
- **The flow.** No dashboard: after log-in you're on your own board at `/`,
  showing only your notes; other people's boards are at `/<username>`.
- **The interactions.** Select notes (one, or several with a box or
  Shift-click), copy and paste them, double-click to edit in place. Then
  labels with a filter, and other people's live cursors with avatars you can
  click to follow.

Before building, it asked me the questions that changed what it would do
(multi-select or single, what "focus" on double-click means, which visual
style), and it pushed back where it disagreed: it argued against putting the
saved-boards navigation on the right before we settle where chat and
presence go, so that part is still being discussed. It tested in the browser
as it went and caught two real bugs I would have hit (double-clicking a note
created a new one on top of it; typing straight after creating a note lost
the first letters). I then checked everything by hand.

The personal board is done for this checkpoint
([`957d95c`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-edwarbudiman/commit/957d95c)),
and so far it's all good.
