---
title: Pipeline
order: 2
---

# The agent pipeline

![Post-its moving through research, decide, spike, build and review](/docs/assets/pipeline.png)

Every feature since week 10 has been built by Claude Code agents running side by side in [Herdr](https://herdr.dev). I'm the owner: I make every product call, try every spike and finished feature myself, and do every merge.

## One idea, one workspace

Each idea gets its own git worktree (`.claude/worktrees/<idea>` on `feat/<idea>`), its own Herdr workspace with one tab per agent, and its own ports. That lets several ideas run in parallel, and I can open them side by side in the browser.

## The stages

| # | Stage | Who | Output | My part |
|---|---|---|---|---|
| 0 | Seed | me | `idea.md`, one paragraph | say the idea |
| 1 | Research | researcher | `research.md`: other apps, Reddit, HN, HCI sources, ending in 2–3 shapes | read it |
| 2 | Decide | lead, talking with me | `decision.md`: the shape I picked, "it works if" lines | pick and defend |
| 3 | Spike | spiker | a throwaway clickable version (~30 min, never merged) | try it, then `/taste` |
| 4 | Build | builder | the real feature from a brief, with tests | |
| 5 | Review | reviewer | `pnpm check`, a drive of the real app in Chrome, a check against my taste | try it, `/taste`, merge |
| 6 | Docs | reviewer drafts, I check | `docs/site/features/<idea>.md` with a demo | approve the page |
| 7 | Reflect | orchestrator | edits to role files, `taste.md`, `rejected.md` | |

## Taste gates

Twice per idea (after the spike, and after review), I try it and run `/taste`. My reaction is sorted into likes, dislikes and rules in `docs/taste.md`, and every later agent reads that file. A rejected idea goes into `docs/rejected.md` so it doesn't come back.

## Fix rounds

If the reviewer asks for changes, a *fresh* builder fixes the blockers and a fresh reviewer checks again. After two failed rounds the idea comes back to me.

## Shipping a feature

When I merge a feature, its docs page has to exist. `pnpm check:docs` fails if a merged `feat/<idea>` has no `docs/site/features/<idea>.md`, so the feature list on this site can't fall behind the app.

## Where the ideas came from

The setup borrows from two open-source Herdr orchestrators, [cheolmin/herdr-orchestrator](https://github.com/cheolmin/herdr-orchestrator) and [contursofran/claude-herdr-orchestrator](https://github.com/contursofran/claude-herdr-orchestrator). The full account is in `docs/orchestration/README.md`.
