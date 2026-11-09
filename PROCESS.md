# Process overview

## The topic

My messages and to-do lists were scattered and cluttered. I wanted a post-it
board, like FigJam. You put a note where you like, and its position shows its
priority and its group. Other people can come to your board and leave a note.
When they are there at the same time, you see their cursor, so the board
feels less lonely.

## The stack, and why

I started in DeepSeek Harness (DSH), with the COMP4020 course skills loaded
([`6672660`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-edwarbudiman/commit/6672660)).
First, the agent read the brief, the crit specs and the fixed parts of the
repo (`fly.toml`, the `Dockerfile`, `spec/`). This kept the plan on the real
constraints and not on the agent's memory.

I used the agent to measure options, not to make the decisions:

- **Database.** It compared six options against one 256 MB machine and one
  volume. It ran `node:sqlite` on Node 24 to prove that it works. The
  experimental warning is the cost.
- **Real-time.** It compared WebSockets, SSE and polling. Live cursors send
  many messages from each client, so I chose WebSockets.
- **I made the calls.** I did not always take its recommendation. I chose an
  infinite canvas, not a fixed board, and React, not plain TypeScript.

The stack is Node 24 and TypeScript on the server, React and Vite on the
client, SQLite on the Fly volume, and WebSockets. The planning session made
only a backlog
([`a0ca454`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-edwarbudiman/commit/a0ca454)),
so the plan, not a long chat, was the handoff to the build.

## Why I left DeepSeek Harness

DSH built a first version from the backlog, and the checks passed. But two
problems stopped me. First, DSH was not stable enough. It was a developer
preview, and its repository warns of breaking changes. Sessions did not
always continue reliably. Second, it built the backlog too literally: a
dashboard of users and a "paper" look. I wanted something simpler. You open
the app and you are on your own board, like Excalidraw.

Thus I moved to Claude Code with Opus. I did not give it the backlog again. I
told it to forget the old design and refine the core: a white, minimal look;
no dashboard, so after log-in you are on your board at `/`; then selection,
copy and paste, labels and live cursors. Before it built, it asked the
questions that changed its work, and it disagreed with me where it had a
reason. It tested in the browser and found two real bugs. I checked the
result by hand. The personal board was done at
[`957d95c`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-edwarbudiman/commit/957d95c).

The lesson is about the harness, not the model. A capable model in an
unstable harness was less useful than a stable harness I could control. The
research note argues this point from the literature.

## Too many skills, too few pull requests

Before the pipeline, I tried many skill sets: Matt Pocock's `grill-me`,
Lauren Tan's pstack and `poteto-agent`, and ideas from posts on X. Each one
was one command to install. They stayed on my computer, and almost none of
them got to a pull request. I read more, but reading did not tell me what to
keep. I needed a process that tested each idea before it went into `main`.

## The pipeline

I built an agent pipeline in Herdr
([`9659d7f`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-edwarbudiman/commit/9659d7f)).
One idea gets one git worktree (`feat/<idea>`) and one Herdr workspace. Each
role is a tab with its own Claude session: lead, researcher, decider, spiker,
builder and reviewer. The roles are markdown files in
`.claude/skills/orchestrate-postits/roles/`. The scripts that start and watch
them are in `scripts/orch/`. Each idea has its own ports, so spikes and
builds run in parallel with `main`.

The handoff between roles is files, not chat: `idea.md`, `research.md`,
`decision.md`, `brief.md`, then reports. Each report starts with a token for
its round, so no role reads an old report as a new one.

I stay in the loop at taste gates. I try each spike in the browser and run
`/taste`. My reactions go in `docs/taste.md`, which every role reads (for
example
[`963d2fc`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-edwarbudiman/commit/963d2fc)).
Only I merge into `main`, after a reviewer agent runs the checks and uses the
real app. Features arrived as pull requests, for example the docs site
([`6818997`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-edwarbudiman/commit/6818997))
and the note sidebar
([`0167ee3`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-edwarbudiman/commit/0167ee3)).
The `/docs/` page shows each role, skill and feature.

This pipeline is also how I sorted the skills. pstack's per-role model
budgets now set which model each role uses. A skill that did not help a spike
or a review did not stay.

## What the spikes taught

The first full run was note-arrows. Research took about 7 minutes and the
decision about 21. Then three spikes changed the decision: a four-sided nub,
magnetic movable ends, two lines for A↔B, and arrow colour
([`789e166`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-edwarbudiman/commit/789e166)).
For small UI ideas, the spike taught more than the research. Thus small ideas
should get a shorter research stage.

## Corrections go into the harness

When an agent made a mistake, I put the fix in the harness, not only in the
code:

- **Agents could not find Node.** Node and pnpm are pinned by mise. I told
  every role to use `mise exec`
  ([`a7eb841`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-edwarbudiman/commit/a7eb841)).
- **Workers stopped after a Herdr restart.** Herdr does not bring agents
  back. Now `spawn.sh` keeps each session id, and a lead can resume its dead
  workers with their full conversation
  ([`6fc7174`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-edwarbudiman/commit/6fc7174)).
- **Cleanup was manual and incomplete.** `retire.sh` now does all of it:
  ports, worktrees, branches, state and the Herdr workspace
  ([`3e52cc1`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-edwarbudiman/commit/3e52cc1)).
- **Reflection looked at the code, not the setup.** The reflect stage now
  runs Pocock's `/retro` first. It asks what in the environment failed
  ([`4305727`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-edwarbudiman/commit/4305727)).
  Treude and Baltes (2026) show that only some `/retro` changes help, so I
  keep a change only when a later idea shows that it works.

The promises the build cannot check are tests in `spec/`: real-time,
persistence, routes, notes, arrows, chat and the sidebar.

## Was it worth it?

For one person, the pipeline is heavy. The research stage often cost more
time than it saved. But it saved time in two places. I could run several
ideas in parallel and step in only to judge. And the taste gates found
problems that tests did not, such as how arrows feel when you drag them. The
largest benefit was a filter: an idea now goes into `main` only after it
passes a spike, my judgement and a review.
