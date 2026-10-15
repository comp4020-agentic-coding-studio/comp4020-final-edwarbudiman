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
