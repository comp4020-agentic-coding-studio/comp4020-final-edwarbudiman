---
title: Spiker
order: 6
tagline: Builds the fastest clickable version, then throws it away.
model: Sonnet
where: spike worktree
avatar: avatars/spiker.webp
---

# Spiker

Builds a smoke test in about 30 minutes, just enough for me to feel whether the shape is right. It lives on `spike/<idea>`, runs on its own ports, and is never merged. When two options are close, it builds both behind `?v=a` and `?v=b`.

## What it does

- Build only what answers the decision's spike question.
- Seed a board and a second user, and leave the app running.
- Take my small tweaks in its own tab and log each one under `## Tweaks`.

## What it never does

- Write tests or polish.
- Merge.

## What it leaves behind

`spike/<idea>` (thrown away), spike report

Full instructions: `.claude/skills/orchestrate-postits/roles/spiker.md`.
