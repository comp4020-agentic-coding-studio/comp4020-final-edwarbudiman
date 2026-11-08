---
title: Builder
order: 7
tagline: Turns the brief into tested code and a docs page.
model: Sonnet
where: idea worktree
avatar: avatars/builder.png
---

# Builder

Implements one brief in the idea's worktree and commits in small steps. It borrows ideas from the spike but never its code. Before it reports, it runs a pre-check: tests for every behaviour, the contract matches, its own diff is clean, and it writes the feature's docs page.

## What it does

- Write specs in `spec/` for each new behaviour, error paths included.
- Update the `verify-postits` feature file so the reviewer can drive it.
- Write `docs/site/features/<slug>.md`: what it is, how to use it, which specs check it.
- Run the full `pnpm check` before reporting.

## What it never does

- Merge, push or rebase.
- Leave the brief's scope.
- Make a product call the brief didn't make; it asks instead.

## What it leaves behind

commits on `feat/<idea>`, the feature's docs page

Full instructions: `.claude/skills/orchestrate-postits/roles/builder.md`.
