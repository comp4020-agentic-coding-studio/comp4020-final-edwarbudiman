# Building Post-its with agents in Herdr

Post-its is built through a pipeline of Claude Code agents in
[Herdr](https://herdr.dev). I am the owner and make the product calls. One
Claude session in root is the main orchestrator: it starts ideas and watches
across them. Each idea then gets its own lead, an orchestrator in the first tab
of the idea's Herdr workspace, and I go to that workspace to work on that idea.
Every idea goes through the same stages:
research, decide, spike, then build and review. I judge each spike and each
finished feature with `/taste`, which saves my reactions to
[`docs/taste.md`](../taste.md) so every later agent works from them. I do every
merge myself.

The playbook agents follow is the `orchestrate-postits` skill in
`.claude/skills/orchestrate-postits/`. This page is the human-readable summary.

## One idea, one workspace

Each idea is a slug, such as `left-for-you`. It gets its own worktree
(`.claude/worktrees/<idea>` on `feat/<idea>`), its own Herdr workspace
(`feat/<idea>`, one tab per worker), its own ports, and its documents in
`docs/ideas/<idea>/`. The spike is built in a separate throwaway worktree on
`spike/<idea>` that is never merged. Several ideas run in parallel, and I can
test them side by side because each has its own ports.

## The stages

| # | Stage | Who | Output | My part |
|---|---|---|---|---|
| 0 | Seed | me | `idea.md`, one paragraph | say the idea |
| 1 | Research | researcher (Opus) | `research.md`: Reddit, HN, app reviews, other apps, HCI sources, ending in 2–3 shapes | read it |
| 2 | Decide | decider (Opus), talking with me | `decision.md`: the shape I picked after being grilled, what I didn't pick, "it works if" lines | pick and defend |
| 3 | Spike | spiker (Sonnet) | a smoke test (about 30 minutes, no tests, hacks allowed) running on the spike ports | try it, tweak small things in the spiker's tab, then `/taste` in the lead tab |
| 4 | Build | builder (Sonnet) | the real feature from a brief, with tests | |
| 5 | Review | reviewer (Opus) | `pnpm check`, an app drive with `verify-postits`, a check against `taste.md` | try it, `/taste`, merge |
| 6 | Reflect | orchestrator | edits to role files, `taste.md`, `rejected.md` | |

Small fixes to a spike I type straight into the spiker's tab, so it keeps its
context; it logs each one under `## Tweaks` in its report. A new spike round is
only for a new direction. `/taste` asks what I thought, sorts it into likes, dislikes and rules in
`docs/taste.md`, and then asks whether to build, re-spike or reject. A rejected
idea goes into [`docs/rejected.md`](../rejected.md) with its reason, and
researchers read that file first, so dropped ideas don't come back.

## Roles

| Role | Works in | Never does |
|---|---|---|
| Orchestrator | root, on `main` | edit app code |
| Researcher | the idea's worktree, documents only | write app code, cite a page it didn't open |
| Decider | the idea's worktree, documents only | pick for me |
| Spiker | the spike worktree | write tests or polish, merge |
| Builder | the idea's worktree | merge, push, rebase, leave the brief's scope |
| Reviewer | the idea's worktree, new tab | edit or commit anything |

The reviewer runs on a different model from the builder and never saw the
build, so it judges only from the brief, the diff, the running app and my taste.

## Build and review loop

1. **Brief.** One per feature at `.claude/orch/<idea>/brief.md`, from
   [`brief-template.md`](../../.claude/skills/orchestrate-postits/brief-template.md),
   filled from `decision.md` and my `/taste` notes on the spike. An idea can need
   several briefs, built one after another in its worktree.
2. **Build**, then **review** when the builder reports `status: done`.
3. **Fix rounds.** On `verdict: changes`, a fresh builder fixes the blockers and a
   fresh reviewer checks again. After two failed rounds it comes back to me.
4. **My check.** On `verdict: approve`, I try it on its ports and run `/taste`.
   Then I merge from root (`git merge feat/<idea>`), run
   `scripts/sync-worktrees.sh`, and `scripts/orch/retire.sh <idea>`.

At most three workers run at once, for the weekly budget and because every
reviewer shares one Chrome.

## Scripts

| Command | What it does |
|---|---|
| `scripts/orch/new-idea.sh <idea> "<seed>"` | Creates the idea's worktree and branch from `main` and commits `docs/ideas/<idea>/idea.md`. Warns when the name is in `rejected.md`. |
| `scripts/orch/spawn.sh <idea> <role> [model]` | Roles: `lead` (the idea's own orchestrator, spawned first), `researcher`, `decider`, `spiker`, `builder`, `reviewer`. Each needs the previous stage's file first. The first spawn opens the Herdr workspace; every spawn opens a tab, starts Claude and points it at its role file. A new round of a role closes that role's previous tab. |
| `scripts/orch/wait.sh <idea> <role> [timeout-ms]` | Waits until the worker settles. Exit 0 with a one-line summary when its report has this round's token, 2 when it is blocked on a dialog, 3 when it stopped without a report. |
| `scripts/orch/resume.sh <idea> <role\|role-N>` | Brings back a worker whose Claude session died (Herdr restart, closed pane) with its whole conversation, keeping its round, token and report path. Uses the session id that `spawn.sh` saved in `reports/<label>.session`, or finds it from the spawn prompt in the worktree's transcripts. After a restart, resume each idea's lead and it resumes its own workers. |
| `scripts/orch/status.sh` | One row per idea: its stage, latest worker, Herdr state, result, branch head, and whether the review is stale. |
| `scripts/orch/retire.sh <idea> [--rejected]` | Closes the workspace, removes both worktrees, deletes both branches. Refuses unless `feat/<idea>` is merged, or the idea is in `rejected.md` with `--rejected`. |

Models can be changed with `ORCH_<ROLE>_MODEL` (for example
`ORCH_BUILDER_MODEL`), and the permission mode with `ORCH_PERMISSION_MODE`
(default `auto`).

## Reports

Each worker writes one report file. Its first line is a token unique to that
round, so a late report from an earlier round is never read as the current one.
Then a short header the orchestrator reads before anything else:

```
token: 3f9a1c0b2e7d
status: done            (a reviewer writes verdict: approve | changes | blocked)
head: <commit SHA>
summary: one to three lines
ask: a question, or none
```

## Ports and data

Each idea gets a port slot, recorded in `.claude/orch/ports.tsv`. The spike
uses the slot's ports plus 5:

| | `main` | 1st idea | 1st idea's spike | 2nd idea |
|---|---|---|---|---|
| `PORT` (server) | 8080 | 8090 | 8095 | 8100 |
| `CLIENT_PORT` (Vite) | 5173 | 5183 | 5188 | 5193 |
| `VERIFY_SERVER_PORT` | 18080 | 18090 | 18095 | 18100 |
| `VERIFY_CLIENT_PORT` | 18173 | 18183 | 18188 | 18193 |

Each worktree's dev database is its own `./data`, and every verification run uses
a fresh `DATA_DIR` in `/tmp`.

## What reaches me

Research ready for a decision, every taste gate (with a reminder to run
`/taste`), product questions a brief didn't settle, a worker blocked on an
approval dialog, a feature that failed two fix rounds, and anything
irreversible (merging, pushing, deploying). The orchestrator settles small calls
itself and logs them under Decisions in `state.md`, so I can overrule them.

## Where things live

| Path | Tracked | What |
|---|---|---|
| `.claude/skills/orchestrate-postits/` | yes | playbook, standing orders, role files, brief template |
| `.claude/skills/taste/` | yes | the `/taste` skill |
| `.cursor/skills` | yes | a symlink to `.claude/skills`, so Cursor sees the same skills |
| `docs/taste.md`, `docs/rejected.md` | yes, on `main` | my taste and the dropped ideas |
| `docs/ideas/<idea>/` | yes, on `feat/<idea>` | `idea.md`, `research.md`, `decision.md` |
| `scripts/orch/` | yes | the scripts above |
| `docs/orchestration/state.md` | yes | live ideas, decisions, my to-dos, reflections, done |
| `.claude/orch/<idea>/` | no | briefs, reports, ports |
| `.claude/worktrees/<idea>[-spike]/` | no | the worktrees |

## Where the ideas came from

I read two open-source Herdr orchestrators before writing this and kept the
parts that fit a worktree-per-feature setup:

- [cheolmin/herdr-orchestrator](https://github.com/cheolmin/herdr-orchestrator):
  wait to see a worker start before waiting for it to finish, count a worker as
  done only when its report exists, put the mission in a file and send a short
  pointer prompt, and answer only the "trust this folder" dialog automatically.
- [contursofran/claude-herdr-orchestrator](https://github.com/contursofran/claude-herdr-orchestrator):
  a token and a short header on each report, the builder's pre-check, a reviewer
  that checks against acceptance lines and splits blockers from nits, a fresh
  builder for each fix round, repo rules in one file every worker reads, a state
  file that survives context compaction, and separate channels for decisions and
  owner to-dos.

I left out cheolmin's write zones and contract files because worktrees and
briefs written after the direction is set already cover them. I also left out
contursofran's mod UI and PR flow, because I merge locally after checking by
hand.
