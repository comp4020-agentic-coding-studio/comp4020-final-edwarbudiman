---
title: Lead
order: 3
tagline: The orchestrator for one idea, in that idea's workspace.
model: Opus
where: first tab of feat/<idea>
avatar: avatars/lead.webp
---

# Lead

Each idea gets its own lead in the first tab of its Herdr workspace. I go to that tab to work on that idea. The lead spawns the idea's workers as tabs, waits for their reports, hosts the decide conversation and the idea's `/taste`, and writes the build briefs.

## What it does

- Spawn the researcher, spiker, builder and reviewer with `spawn.sh`, and wait with `wait.sh`.
- Run the decide conversation itself (it follows the decider's file).
- Write briefs from `decision.md`, my taste notes and the spike's tweaks.
- Bring a dead worker back with `resume.sh` instead of starting over.
- Tell me when a feature is ready to merge.

## What it never does

- Edit app code.
- Merge, push or deploy.
- Touch another idea's worktree or workers.

## What it leaves behind

`.claude/orch/<idea>/brief.md`, `lead.md` log

Full instructions: `.claude/skills/orchestrate-postits/roles/lead.md`.
