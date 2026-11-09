# Process overview

## The topic

I wanted a place for the messages and to-do lists that end up scattered and
cluttered: a post-it board, like FigJam, where you put notes wherever you like
and their position is how you prioritise and group them. What makes it
multi-user is that other people can come to your board and leave you a note,
and being there with them at the same time makes it feel less lonely.

## My setup: Herdr and Claude Code

My setup for this project is Herdr and Claude Code. Herdr gives me
workspaces and tabs, and each tab runs its own Claude Code session. That is
the setup I already worked in, and it is the one I came back to.

I did try DeepSeek Harness first, mostly because I was curious what it feels
like. I set it up properly: I loaded the COMP4020 course skills into it
([`6672660`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-edwarbudiman/commit/6672660))
and pointed it at my Claude Code skills, so it could understand the same
setup I already had. It planned a backlog
([`a0ca454`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-edwarbudiman/commit/a0ca454))
and built a first version that passed the checks.

But after using it for a little while, I still felt more at home in Herdr and
Claude Code. It also took the backlog too literally (a dashboard of users and
a "paper" look) when what I wanted was simpler: open the app and you are on
your own board, like Excalidraw. So I went back to Claude Code, told it to
forget the old design, and refined the core with it: a white, minimal look,
your own board at `/`, then selection, copy and paste, labels and live
cursors. The personal board was done at
[`957d95c`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-edwarbudiman/commit/957d95c).

The tool was not the problem. I simply worked better in the setup that
already felt like mine.

## Building my own pipeline

Before I had a pipeline, I tried a lot of other people's ways of working. I
used Matt Pocock's skills, like grilling, where the agent questions you hard
on a plan. I tried to understand Lauren Tan's poteto agents and pstack. I
browsed many other skills that people shared on X. Each one is one command
to install, and many of them are good. But none of them felt like mine. They
stayed on my computer, and almost none of them got into a pull request.

What finally clicked was writing the skills myself. I sat down, kept the
parts of those skills that worked for me, and turned them into my own
pipeline for this assignment
([`9659d7f`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-edwarbudiman/commit/9659d7f)).
After that, things just worked.

How it works:

- **One idea, one place.** Each idea gets its own git worktree
  (`feat/<idea>`) and its own Herdr workspace, with its own ports, so several
  ideas can run side by side without touching `main`.
- **Roles as tabs.** Inside the workspace, each role is a tab with its own
  Claude session: lead, researcher, decider, spiker, builder and reviewer.
  Each role is a plain markdown file in
  `.claude/skills/orchestrate-postits/roles/`, and the scripts that start and
  watch them are in `scripts/orch/`.
- **Handoff by files.** Roles pass work through files, not chat: `idea.md`,
  `research.md`, `decision.md`, `brief.md`, then reports.
- **I judge, they build.** The spiker makes a throwaway version, I try it in
  the browser, and I run `/taste`. My reactions go into `docs/taste.md`,
  which every role reads
  ([`963d2fc`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-edwarbudiman/commit/963d2fc)).
  Only I merge into `main`, for example the note sidebar
  ([`0167ee3`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-edwarbudiman/commit/0167ee3)).

The other people's skills did not disappear. They became parts of my
pipeline: pstack's per-role model settings decide which model each role uses,
and Matt Pocock's `/retro` now runs at the end of every idea.

## Documentation as part of shipping

I also wanted each feature to explain itself, so I added a docs site at
`/docs/`
([`d162918`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-edwarbudiman/commit/d162918)).
It lists every feature with how to use it and a demo, plus pages for the
pipeline, the roles and the skills. It is plain Markdown served by the app,
so there is no build step and no extra service on the small Fly machine, and
`pnpm check:docs` fails if a merged feature has no docs page.

Later I made documentation its own role
([`8475d44`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-edwarbudiman/commit/8475d44)).
After the reviewer approves, the lead spawns a documenter. It follows the
feature's steps in the real app, writes the page with a demo, and commits it
on the feature branch, so the docs land in the same merge as the feature.

## The pipeline keeps changing

Because the skills are mine, I can fix them when they break:

- **Agents could not find Node.** Node and pnpm are pinned by mise, so every
  role now uses `mise exec`
  ([`a7eb841`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-edwarbudiman/commit/a7eb841)).
- **Workers stopped after a Herdr restart.** `spawn.sh` now keeps each
  session id, so a lead can bring its workers back with their full
  conversation
  ([`6fc7174`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-edwarbudiman/commit/6fc7174)).
- **Small ideas did not need much research.** On note-arrows, three spikes
  changed the decision more than the research did
  ([`789e166`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-edwarbudiman/commit/789e166)).
- **Reflection looked at the code, not the setup.** The reflect stage now
  runs `/retro` first, so each idea ends by asking what in the environment
  got in the way
  ([`4305727`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-edwarbudiman/commit/4305727)).
  That retro is what steers the next session.

For one person it is a heavy setup. But it is mine, it fits how I think, and
every idea now passes a spike, my taste and a review before it reaches
`main`.
