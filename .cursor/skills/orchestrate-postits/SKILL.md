---
name: orchestrate-postits
description: Run Post-its feature work as an orchestrator in Herdr. The owner and this session set the direction, split it into features, and each feature gets its own worktree, Herdr workspace, a builder agent, then a separate reviewer agent that drives the real app. Reports come back here, the owner checks each feature by hand, then merges. Use for "orchestrate", "spawn a worker for <feature>", "start the pipeline", or checking on running workers.
---

# Orchestrate Post-its

This session is the orchestrator. The owner (the user) is the CEO. The orchestrator writes briefs, starts workers, reads their reports and keeps the state file current. It never edits feature code itself; code changes go through a builder.

Run this only inside a Herdr pane (`HERDR_ENV=1`). The scripts check.

## The loop

1. **Direction first.** Before any spawn, the owner and orchestrator agree the full direction and cut it into features in `docs/orchestration/state.md` (Ready list). Each feature must be independent enough to build in parallel. Any API, WebSocket message or schema change a feature makes is written in its brief, so features that touch the same contract are visible before they start. Overlaps that remain are settled at merge time, by the owner.
2. **Brief.** Copy `brief-template.md` to `.claude/orch/<feature>/brief.md` and fill every field. A field you cannot fill means the feature is not ready. The brief is the only thing the worker knows; it cannot ask questions while it works.
3. **Build.** `scripts/orch/spawn.sh <feature> builder`. This creates `.claude/worktrees/<feature>` on `feat/<feature>` from `main`, a Herdr workspace labelled `feat/<feature>`, the feature's own ports, and starts Claude (Sonnet by default) with a pointer to the brief. Then run `scripts/orch/wait.sh <feature> builder` with `run_in_background`; its exit is the completion event. Do not poll and do not prompt a worker to check on it.
4. **Review.** When the builder reports `status: done`, run `scripts/orch/spawn.sh <feature> reviewer` (Opus by default, a different model from the builder) and wait the same way. The reviewer runs the checks and `verify-postits` at the builder's head commit and changes nothing.
5. **Fix rounds.** Verdict `changes`: spawn a fresh builder (`spawn.sh <feature> builder` again, it becomes `builder-2`) whose brief gains a `## Fix round` section pointing at the review report. Then a fresh reviewer. After two failed fix rounds, stop and put it to the owner.
6. **Owner check.** Verdict `approve`: add the feature to the owner's to-dos in the state file with the worktree path, the ports, what to try by hand, and the reviewer's evidence folder. The owner tries it, then either merges (`git merge feat/<feature>` from root, per `CLAUDE.md`) or sends notes, which become a fix round.
7. **After merge.** The owner or orchestrator runs `scripts/sync-worktrees.sh` so the other features pick up `main`, then `scripts/orch/retire.sh <feature>`.

Several features run this loop at once. Keep at most three workers live (budget, and one shared Chrome for verification).

## Reading reports

Every report starts with a header (format in `standing-orders.md`). `wait.sh` prints a one-line summary. Read the header first and the full report only when the summary is not enough. When a fix builder needs the review, give it the review report's path; don't paste it.

`scripts/orch/status.sh` shows every feature, its latest builder and reviewer, their Herdr state and verdicts, and marks a review as stale when the branch head moved after it.

## The owner

Only these reach the owner, written into the state file's `Decisions` or `To-do for the owner` sections and said in chat:

- product and design choices a brief did not settle (a worker's `ask:` line, when it is the owner's call);
- a worker blocked on a dialog (`wait.sh` exit 2). Do not answer approval dialogs for a worker;
- a feature ready for the manual check, and every merge;
- a feature that failed two fix rounds;
- anything irreversible: pushing, deploying, deleting branches that are not merged.

The orchestrator settles the rest itself and notes it under `Decisions` with `(decided by orchestrator)`, so the owner can overrule it.

## State that survives compaction

`docs/orchestration/state.md` is the orchestrator's memory: Direction, Ready, Running, Decisions, To-do for the owner, Done. Update it when something changes, not after every event. After a context compaction, read it and `status.sh` before acting.

Runtime files live in `.claude/orch/` (gitignored): `<feature>/brief.md`, `<feature>/reports/<role>-<n>.md`, `<feature>/env.sh` (ports), `ports.tsv`, `spawns.tsv`.

## Wrap-up

When the owner says wrap up: start no new workers, let running ones finish, record their results in the state file, and stop.

## Files

- `standing-orders.md`: rules every worker reads first. Paste-free: spawn.sh points workers at it.
- `roles/builder.md`, `roles/reviewer.md`: each role's job and checklist.
- `brief-template.md`: the brief every feature needs.
