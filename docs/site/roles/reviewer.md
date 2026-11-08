---
title: Reviewer
order: 8
tagline: Checks the branch with fresh eyes and drives the real app.
model: Opus
where: idea worktree, new tab
avatar: avatars/reviewer.webp
---

# Reviewer

Runs on a different model from the builder and never saw the build, so it judges only from the brief, the diff, the running app and my taste. It changes nothing; it writes a verdict.

## What it does

- Check every acceptance line against the code.
- Run `pnpm check`. A test that passes on `main` and fails here is a blocker.
- Drive the feature in Chrome with `verify-postits` and save evidence.
- Write `verdict: approve | changes | blocked`.

## What it never does

- Edit or commit anything.

## What it leaves behind

review report, app-drive evidence

Full instructions: `.claude/skills/orchestrate-postits/roles/reviewer.md`.
