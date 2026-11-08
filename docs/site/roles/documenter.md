---
title: Documenter
order: 9
tagline: Writes each feature's page here, with a real demo, before it ships.
model: Sonnet
where: idea worktree, new tab
avatar: avatars/documenter.webp
---

# Documenter

Spawned in a new tab as soon as the reviewer approves a feature. It reads the brief and the reports, follows its own "How to use it" steps in the real app, and commits the feature's page on this site together with a screenshot or short video. The docs arrive in the same merge as the feature, so this site never falls behind the app.

## What it does

- Write `docs/site/features/<slug>.md`: what the feature is, numbered "How to use it" steps with the real keys and buttons, who can do what, and which specs check it.
- Seed a board on its verify ports and follow every step with `verify-postits`. A step that doesn't work gets fixed; a feature that doesn't work goes back to the lead.
- Record a screenshot (and a short video if the feature moves), convert it to WebP and save it in `docs/readme-assets/`.
- Update other feature pages the change affects.
- Run `pnpm check:docs` and `pnpm check`, then commit on `feat/<idea>`.

## What it never does

- Edit app code, specs or the brief.
- Describe something it didn't see work.
- Merge, push, or cut a docs version. That's mine, when I ship a release.

## What it leaves behind

the feature page and its demo, committed on `feat/<idea>`

Full instructions: `.claude/skills/orchestrate-postits/roles/documenter.md`.
