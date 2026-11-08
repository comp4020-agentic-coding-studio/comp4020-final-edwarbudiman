# Your harness

## COMP4020 Skills Integration

I have COMP4020 course skills available in `.dsh-skills/comp4020/`. When the user mentions comp4020 tasks or uses trigger words, load the appropriate skill from that directory.

### Skill Loading

When I need to use a COMP4020 skill:
1. Read the corresponding `.skill.md` file from `.dsh-skills/comp4020/`
2. Follow the instructions in that file
3. Use the scripts in `.dsh-skills/comp4020/scripts/` as needed

### Available Skills and Triggers

| Trigger Words | Skill File | Purpose |
|---------------|------------|---------|
| "what can comp4020 help", "/comp4020:help" | `help.skill.md` | List all skills |
| "what's due", "upcoming deadlines", "what should I work on" | `radar.skill.md` | Show deadlines |
| "is my setup right", "check my environment", "/doctor" | `doctor.skill.md` | Diagnose setup |
| "am I ready to submit", "preflight check", "/preflight" | `preflight.skill.md` | Pre-submission checks |
| "ship it", "make repo public", "/ship" | `ship.skill.md` | Deploy and publish |
| "check my balance", "how much budget" | `balance.skill.md` | Check API budget |
| "when is X due", "course policies", "extension policy" | `handbook.skill.md` | Course admin queries |
| "set up my key", "join GitHub org", "onboard" | `onboard.skill.md` | First-time setup |
| "start this week's prototype", "start assignment" | `start.skill.md` | Start new work |
| "start the riff", "riff session" | `riff.skill.md` | Crit session support |
| "set up stack", "switch stack" | `stack.skill.md` | Stack helpers |

### Skill Loading Example

When user says "what's due this week?":
1. Read `.dsh-skills/comp4020/radar.skill.md`
2. Follow its instructions (run scripts/next-deadline.sh, fetch course data, format output)
3. Provide the response

### Environment Variables for Scripts

DSH does not load the `env` block of `.claude/settings.local.json`, so set these
inline when running COMP4020 scripts:
- `CLAUDE_PLUGIN_ROOT=.dsh-skills/comp4020`
- `COMP4020_GROUP=baishi` (the user's crit group)
- `ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_MODEL` — only for skills that
  need them (balance, doctor). Load them from `.claude/settings.local.json` inside the
  command (e.g. `export ANTHROPIC_AUTH_TOKEN=$(node -p 'require("./.claude/settings.local.json").env.ANTHROPIC_AUTH_TOKEN')`)
  and never print the token.

In DSH, the course proxy is the `comp4020` model provider (`claude-sonnet-5`,
`claude-sonnet-5-5`, `claude-opus-5-5`, plus the free `soco-fast` / `soco-smart`); its key is stored in `~/.dsh/.credentials.yaml` as `COMP4020_API_KEY`.

### General Rules

- Always check `[exit code: N]` markers on bash results
- Use Read tool for text files, not cat
- Read files before editing them  
- Never echo secrets or API keys
- Confirm destructive operations (like making repo public)

## Project-Specific Context

This is the COMP4020 final project repository at:
`/Users/edwarb/projects/uni-project/advanced-hci/comp4020-final-edwarbudiman`

Standard workflows:
- **Before submission**: Run preflight checks
- **Deployment**: Run ship workflow with confirmation
- **Setup issues**: Run doctor diagnostics

## Branches and worktrees

The root checkout always stays on `main`. It is where features get integrated
and tested. Each feature lives in its own linked worktree:

- Path `.claude/worktrees/<name>`, branch `feat/<name>`, one Herdr workspace per
  worktree, labelled with the branch name and with its cwd set to the worktree.
- To start a feature: `git worktree add .claude/worktrees/<name> -b feat/<name> main`,
  then `herdr workspace create --cwd <worktree path> --label feat/<name> --no-focus`.
- Commit feature work inside its worktree, never in root.
- Commit shared changes (harness, `.gitignore`, idea docs, scripts) on `main` in
  root, then run `scripts/sync-worktrees.sh` to merge `main` into every worktree.
  The script skips worktrees with uncommitted changes and stops on merge
  conflicts. Commit the WIP or resolve the conflict in that worktree, then run
  it again.
- When a feature is ready, merge it into `main` from root (`git merge feat/<name>`),
  test it there, then run the sync script so the other features pick it up.
- Use merges to bring `main` into a feature branch, not rebases.

## Running commands

Node and pnpm are pinned by mise (`mise.toml`) and aren't on the plain `PATH`
of agent shells, so always run them through mise:

- `mise exec -- pnpm check`, `mise exec -- pnpm dev`, `mise exec -- pnpm install --frozen-lockfile`,
  `mise exec -- pnpm vitest run spec/arrows.test.ts`, `mise exec -- node ...`.
- Wherever this file, a skill or a role says `pnpm ...`, read it as `mise exec -- pnpm ...`.
- A new worktree must be trusted once: `mise trust <worktree path>`.

## Working with agents

Work runs as a pipeline in Herdr, one idea at a time or several in parallel.
Each idea gets one worktree (`.claude/worktrees/<idea>`, branch `feat/<idea>`)
and one Herdr workspace, and moves through research, decide, a throwaway spike
(`spike/<idea>`, never merged), build and review. The owner judges each spike
and finished feature with `/taste`, which saves to `docs/taste.md`. The
playbook is the `orchestrate-postits` skill (`.claude/skills/orchestrate-postits/`);
the scripts are in `scripts/orch/`; the orchestrator's state is
`docs/orchestration/state.md`; the human-readable summary is
`docs/orchestration/README.md`.

- `scripts/orch/new-idea.sh <idea> "<seed>"` creates the worktree, and
  `scripts/orch/spawn.sh <idea> <role>` opens the Herdr workspace on first use,
  so don't create them by hand as well.
- Each idea has its own ports (`PORT`, `CLIENT_PORT`, `VERIFY_SERVER_PORT`,
  `VERIFY_CLIENT_PORT`); its spike uses those plus 5. Main keeps 8080/5173.
- Workers commit in their worktree and never merge, push or rebase. Only the
  owner merges into `main`, after checking the feature by hand.
- Whenever you show the owner something to judge, end with a reminder to run
  `/taste` so their reaction is saved.
- Checks: `mise exec -- pnpm check`. App verification: the `verify-postits` skill.
