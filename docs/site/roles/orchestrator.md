---
title: Main orchestrator
order: 2
tagline: Starts ideas and watches across all of them.
model: Opus
where: root, on main
avatar: avatars/orchestrator.png
---

# Main orchestrator

One Claude session in the root checkout. It starts each idea, keeps `docs/orchestration/state.md` current, and runs reflection after each idea is merged or rejected. It doesn't run an idea's stages; each idea's lead does.

## What it does

- Start an idea: `new-idea.sh <idea> "<seed>"`, then `spawn.sh <idea> lead`.
- Watch every idea with `scripts/orch/status.sh`.
- Keep `state.md`: live ideas, decisions, my to-dos, reflections.
- After a merge or rejection, turn what went wrong into edits to role files, scripts or the brief template.

## What it never does

- Edit app code.
- Run an idea's stages itself.

## What it leaves behind

`docs/orchestration/state.md`, `scripts/orch/`, role files
