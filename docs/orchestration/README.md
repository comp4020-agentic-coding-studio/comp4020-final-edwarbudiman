# Building Post-its with agents in Herdr

From checkpoint F on, features are built by a pipeline of Claude Code agents in
[Herdr](https://herdr.dev). I am the owner and make the product calls. One
Claude session is the orchestrator: it helps me set the direction, writes a
brief for each feature, starts a builder and then a separate reviewer for it,
and brings their reports back. I check every feature by hand and do every merge
myself.

The playbook agents follow is the `orchestrate-postits` skill in
`.cursor/skills/orchestrate-postits/`. This page is the human-readable summary.

## Roles

| Role | Who | Does | Never does |
|---|---|---|---|
| Owner | me | sets direction, answers product questions, checks each feature by hand, merges | |
| Orchestrator | a Claude session in root, on `main` | writes briefs, starts and waits on workers, reads reports, keeps `state.md` current | edit feature code |
| Builder | Claude (Sonnet by default), in the feature's worktree | implements the brief, writes tests, commits, reports with a pre-check | merge, push, rebase, leave the brief's scope |
| Reviewer | Claude (Opus by default), same worktree, a new tab | runs `pnpm check`, drives the real app with `verify-postits`, reports `approve`, `changes` or `blocked` | edit or commit anything |

The reviewer runs on a different model from the builder and never saw the build,
so it judges only from the brief, the diff and the running app.

## The loop

1. **Direction.** The owner and the orchestrator agree the full direction and cut
   it into features in [`state.md`](state.md). Each feature should be independent
   enough to build in parallel. Any API, WebSocket or schema change goes in the
   feature's brief, so overlaps show before anything starts. What still overlaps
   is settled when I merge.
2. **Brief.** One per feature at `.claude/orch/<feature>/brief.md`, from
   [`brief-template.md`](../../.cursor/skills/orchestrate-postits/brief-template.md):
   goal, files to read, scope, contract, acceptance lines, verification, out of
   scope. A section that can't be filled means the feature isn't ready.
3. **Build.** `scripts/orch/spawn.sh <feature> builder`, then
   `scripts/orch/wait.sh <feature> builder` in the background.
4. **Review.** When the builder reports `status: done`,
   `scripts/orch/spawn.sh <feature> reviewer` and wait the same way.
5. **Fix rounds.** On `verdict: changes`, a fresh builder (`builder-2`, ...) gets
   the review report and fixes the blockers, then a fresh reviewer. After two
   failed rounds the feature comes back to me.
6. **Manual check.** On `verdict: approve`, I run the feature on its ports and
   try it. Then I merge from root (`git merge feat/<feature>`), run
   `scripts/sync-worktrees.sh`, and `scripts/orch/retire.sh <feature>`.

At most three workers run at once, for the weekly budget and because every
reviewer shares one Chrome.

## Scripts

| Command | What it does |
|---|---|
| `scripts/orch/spawn.sh <feature> builder\|reviewer [model]` | First call creates `.claude/worktrees/<feature>` on `feat/<feature>` from `main`, installs dependencies, and opens a Herdr workspace labelled `feat/<feature>`. Every call opens a tab, starts Claude and points it at the brief. A new round closes the previous tab of that role. |
| `scripts/orch/wait.sh <feature> builder\|reviewer [timeout-ms]` | Waits until the worker settles. Exit 0 with a one-line summary when its report has this round's token, 2 when it is blocked on a dialog, 3 when it stopped without a report. |
| `scripts/orch/status.sh` | One row per feature: latest builder and reviewer, their Herdr state, verdicts, branch head, and whether the review is stale because the branch moved after it. |
| `scripts/orch/retire.sh <feature>` | After the merge: closes the workspace, removes the worktree, deletes the branch. Refuses if the branch isn't merged into `main`. |

Defaults can be changed with `ORCH_BUILDER_MODEL`, `ORCH_REVIEWER_MODEL` and
`ORCH_PERMISSION_MODE` (default `auto`).

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

A builder's report also has its plan, what changed, a pre-check (tests, contract,
up to date with `main`, own diff read, acceptance coverage, removed duties,
`pnpm check` output) and steps for trying it by hand. A reviewer's has each
acceptance line and where it's done, numbered blockers with `file:line`, nits,
and the app drive with screenshots and the SQLite query output.

## Ports and data

Each feature gets its own port block, recorded in `.claude/orch/ports.tsv` and
passed into its Herdr workspace:

| | `main` | 1st feature | 2nd feature |
|---|---|---|---|
| `PORT` (server) | 8080 | 8090 | 8100 |
| `CLIENT_PORT` (Vite) | 5173 | 5183 | 5193 |
| `VERIFY_SERVER_PORT` | 18080 | 18090 | 18100 |
| `VERIFY_CLIENT_PORT` | 18173 | 18183 | 18193 |

Each worktree's dev database is its own `./data`, and every verification run uses
a fresh `DATA_DIR` in `/tmp`. The specs need a running server, so run them as
`APP_URL=http://localhost:$PORT pnpm check` with a server on `$PORT`.

## What reaches me

The orchestrator settles small calls itself and logs them under Decisions in
`state.md`, so I can overrule them. Only these come to me: product or design
questions a brief didn't settle, a worker blocked on an approval dialog, a
feature ready for its manual check, a feature that failed two fix rounds, and
anything irreversible (merging, pushing, deploying).

## Where things live

| Path | Tracked | What |
|---|---|---|
| `.cursor/skills/orchestrate-postits/` | yes | playbook, standing orders, role checklists, brief template |
| `scripts/orch/` | yes | the scripts above |
| `docs/orchestration/state.md` | yes | direction, ready features, decisions, owner to-dos, done |
| `.claude/orch/<feature>/` | no | brief, reports, ports for a running feature |
| `.claude/worktrees/<feature>/` | no | the feature's worktree |

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
