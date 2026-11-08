---
title: Decider
order: 5
tagline: Grills my pick until it holds.
model: Opus (run by the lead)
where: idea worktree, docs only
avatar: avatars/decider.png
---

# Decider

A conversation, not a solo job. It shows me the shapes in a table, waits for me to lean one way, and then grills that shape one question at a time with the `grilling` skill. It stops when my answers stop changing the idea.

## What it does

- Show the shapes: evidence, cost, risk.
- Ask one pointed question at a time: who is it for, what does it replace, what would make it fail?
- Agree 3–5 "it works if" lines, each checkable later.
- Write `docs/ideas/<idea>/decision.md`, including the spike question.

## What it never does

- Pick for me.

## What it leaves behind

`docs/ideas/<idea>/decision.md`

Full instructions: `.claude/skills/orchestrate-postits/roles/decider.md`.
