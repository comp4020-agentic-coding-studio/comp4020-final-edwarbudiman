---
name: orchestrate-postits
description: Run Post-its work as an orchestrator in Herdr, one idea at a time or several in parallel. Each idea gets one worktree and one Herdr workspace and moves through research, decide, spike (a smoke test the owner tries and judges with /taste), build and review, then reflect. Use for "new idea", "orchestrate", "start the pipeline", "research <idea>", "spike it", "spawn a worker", or checking on running ideas.
---

# Orchestrate Post-its

There are two kinds of orchestrator. The owner (the user) makes the product calls with both.

- **Main orchestrator**, in root on `main`. It starts ideas (`new-idea.sh`, then `spawn.sh <idea> lead`), watches across them with `status.sh`, keeps `docs/orchestration/state.md` current, and runs reflection. It doesn't run an idea's stages.
- **Lead**, one per idea, in the first tab of the idea's workspace (`roles/lead.md`). It runs that idea's stages below: spawns its workers as tabs, waits for them, hosts the decide conversation and the idea's `/taste`, and writes its briefs. The owner goes to the idea's workspace to work on that idea.

Neither edits app code; code changes go through a spiker or a builder. Run inside a Herdr pane (`HERDR_ENV=1`). The scripts check.

Starting an idea, from the main orchestrator:

```
scripts/orch/new-idea.sh <idea> "<seed>"
scripts/orch/spawn.sh <idea> lead      # opens workspace feat/<idea>; the lead spawns the researcher
```

The rest of this file is written for whoever runs an idea's stages, which is normally its lead.

## One idea, one workspace

An idea is a slug such as `left-for-you`. It gets:

- the worktree `.claude/worktrees/<idea>` on `feat/<idea>`, with its documents in `docs/ideas/<idea>/` (committed on that branch);
- one Herdr workspace labelled `feat/<idea>`, where every worker is a tab;
- its own ports. The spike runs 5 ports above the build, so both can be open at once;
- a throwaway spike worktree `.claude/worktrees/<idea>-spike` on `spike/<idea>`, never merged.

Several ideas can run at once, each in its own workspace. Keep at most three workers live at once (budget, and one shared Chrome).

## The stages

| # | Stage | Command | Worker writes | Then |
|---|---|---|---|---|
| 0 | Seed | `new-idea.sh` and `spawn.sh <idea> lead` (main orchestrator) | `idea.md` | the lead spawns the researcher |
| 1 | Research | `spawn.sh <idea> researcher` | `research.md`: web, Reddit and HCI sources, 2–3 shapes | tell the owner it's ready to decide |
| 2 | Decide | the lead runs it in its own tab (`roles/decider.md`); `spawn.sh <idea> decider` only without a lead | `decision.md`: the owner's pick, grilled, with "it works if" lines | spawn the spiker |
| 3 | Spike | `spawn.sh <idea> spiker` | a smoke test running on the spike ports | **taste gate** |
| 4 | Build | brief, then `spawn.sh <idea> builder` | commits on `feat/<idea>` | spawn the reviewer |
| 5 | Review | `spawn.sh <idea> reviewer` | verdict and app drive | on approve, spawn the documenter |
| 5b | Docs | `spawn.sh <idea> documenter` | `docs/site/features/<slug>.md` and its demo, committed on `feat/<idea>` | **taste gate** (the owner tries the feature and reads its page), then the owner's merge |
| 6 | Reflect | in this session | updates to `taste.md`, `rejected.md`, these skill files | the next idea starts better |

After each `spawn.sh`, run `scripts/orch/wait.sh <idea> <role>` with `run_in_background`; its exit is the completion event. Don't poll.

Decide is a conversation in the lead's tab, where the owner already is.

### Taste gates

Whenever you show the owner something to judge (a spike's `## Try it`, or a feature a reviewer approved), give them the URL and what to try, and **always end with this reminder, word for word**:

> When you've tried it, run `/taste` and say what you think, so I save it to `docs/taste.md`.

For a spike, also tell them small fixes can be typed straight into the `spiker-N` tab: the spiker keeps its context, tweaks the spike and logs each change under `## Tweaks` in its report. A new spike round is only for a new direction.

Then wait. Don't brief, build or re-spike until the owner has used `/taste` (or has explicitly said to go ahead without it). The `taste` skill records their notes and asks build, re-spike or reject.

### Briefs (stage 4)

An idea can need one brief or several. Write each from `brief-template.md` into `.claude/orch/<idea>/brief.md`, filling it from `decision.md`, the owner's `/taste` notes and the last spike report's `## Tweaks`. Briefs for the same idea are built one after another in the idea's worktree. Archive a finished brief as `brief-<n>.md` before writing the next one. A section you can't fill means it isn't ready.

### Fix rounds

Verdict `changes`: append a `## Fix round` section to the brief that points at the review report, then spawn a fresh builder (it becomes `builder-2`) and then a fresh reviewer. After two failed fix rounds, stop and put it to the owner.

### Merge

After the owner's taste check on an approved feature, they merge from root (`git merge feat/<idea>`, or merge the PR on GitHub and `git pull` in root), then run `scripts/sync-worktrees.sh` and `scripts/orch/retire.sh <idea>`. A rejected idea goes in `docs/rejected.md` first, then `retire.sh <idea> --rejected`.

### Docs (stage 5b)

When the reviewer writes `verdict: approve`, spawn the documenter straight away (`spawn.sh <idea> documenter`, then `wait.sh <idea> documenter`). It opens in a new tab of the idea's workspace, writes the feature's `/docs/` page, records a real demo, and commits both on `feat/<idea>`. Only then show the owner the taste gate: the feature on its ports and its page at `/docs/features/<slug>/`. If the documenter reports `status: blocked` because a step doesn't work, treat it as a fix round.

A merged idea with no page fails `pnpm check:docs` on `main` (it reads Done in `state.md`), so never ask the owner to merge before the documenter has reported `status: done`. When a merge changes what users can do, remind the owner they can cut a docs version with `pnpm docs:version`.

`retire.sh` is the whole cleanup: it stops the servers on the idea's ports, removes both worktrees, deletes the local branches and `feat/<idea>` on origin, moves the idea to Done in `state.md`, and closes the idea's Herdr workspace with every agent tab. It closes the workspace last, so the idea's lead can run it once the owner says the merge is in. Commit `state.md` on main afterwards.

### Reflect (stage 6)

After a merge or a rejection, run pstack `reflect` over this session, or do it by hand: what slowed us down, which instruction a worker got wrong, and which owner correction came up twice. Turn each into an edit to a role file, the brief template, or a script check (a repeated correction belongs in a script, not in more text). Add rejected shapes to `docs/rejected.md`. Write a short entry under `## Reflections` in `state.md`.

## What reaches the owner

Said in chat, and written in `state.md` under `To-do for the owner`:

- research ready to decide (stage 2 is theirs);
- each taste gate, with the `/taste` reminder;
- a worker's `ask:` that is a product call;
- a worker blocked on a dialog (`wait.sh` exit 2). Never answer approval dialogs for a worker;
- a feature that failed two fix rounds;
- anything irreversible: merging, pushing, deploying, deleting unmerged branches.

Settle the rest yourself and log it under `Decisions` with `(decided by orchestrator)`.

## State that survives compaction

`docs/orchestration/state.md` holds Ideas (one line each with its stage), Decisions, To-do for the owner, Reflections and Done. After a compaction, read it and run `scripts/orch/status.sh` before acting.

Runtime files live in `.claude/orch/<idea>/` (gitignored): `brief.md`, `reports/<role>-<n>.md` (plus `.token`, `.tab` and `.session`, the worker's Claude session id), `env.sh` and `env-spike.sh` (ports), `workspace`. Shared: `ports.tsv`, `spawns.tsv`, `resumes.tsv`.

## When agents die

Herdr doesn't bring agents back after a restart or a closed pane. `status.sh` then shows them as `gone` with no `RESULT`. A gone worker isn't a failed round, so don't spawn a new one:

- `scripts/orch/resume.sh <idea> lead` brings an idea's lead back with its whole conversation. The resumed lead checks its workers next.
- `scripts/orch/resume.sh <idea> <role>` (or `<role>-<n>`) does the same for a worker. It keeps the round, token and report path, so `wait.sh` works as before. Start `wait.sh` again afterwards.
- The main orchestrator resumes the leads. Each lead resumes its own workers. A `gone` worker that already wrote its report needs no resume unless the owner wants to talk to it.
- Use `spawn.sh` for a new round only when the old session can't be found or its direction is wrong.

## Files

- `standing-orders.md`: rules every worker reads first.
- `roles/lead.md`: the per-idea orchestrator.
- `roles/researcher.md`, `roles/decider.md`, `roles/spiker.md`, `roles/builder.md`, `roles/reviewer.md`: each role's job and report.
- `brief-template.md`: the brief for a build.
- The `taste` skill (`.claude/skills/taste/`), plus `docs/taste.md` and `docs/rejected.md` in root.
