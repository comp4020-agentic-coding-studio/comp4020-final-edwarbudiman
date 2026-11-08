---
title: Skills and scripts
order: 4
---

# Skills and scripts

## Project skills

These live in `.claude/skills/` and are checked in, so every agent works from the same playbook.

| Skill | Used by | What it does |
|---|---|---|
| `orchestrate-postits` | orchestrator, lead | the pipeline playbook: stages, taste gates, briefs, fix rounds, merge and retire |
| `taste` | me, via `/taste` | saves my reaction to a spike or feature into `docs/taste.md`, then asks build, re-spike or reject |
| `verify-postits` | reviewer, builder | drives the real app in Chrome like a user (logs in, creates and moves notes, opens a second user) and captures proof |

## Other skills

| Skill | Used for |
|---|---|
| `mattpocock-skills:grilling` | the decide stage: one pointed question at a time until the idea holds |
| `pstack` (reflect, model setup) | reflection after each idea, and which model each role runs on |
| `comp4020:*` (preflight, ship, handbook) | course checks before a crit, and shipping the deploy |

## Scripts

| Command | What it does |
|---|---|
| `scripts/orch/new-idea.sh <idea> "<seed>"` | creates the worktree and branch, and commits `idea.md` |
| `scripts/orch/spawn.sh <idea> <role>` | opens a Herdr tab, starts the agent and points it at its role file |
| `scripts/orch/wait.sh <idea> <role>` | waits until the worker's report for this round exists |
| `scripts/orch/resume.sh <idea> <role>` | brings back a worker whose session died, with its whole conversation |
| `scripts/orch/status.sh` | one row per idea: stage, latest worker, result |
| `scripts/orch/retire.sh <idea>` | after merge: stops servers, removes worktrees and branches, closes the workspace |
| `scripts/sync-worktrees.sh` | merges `main` into every feature worktree |
| `pnpm check:docs` | fails if a merged feature has no docs page |
