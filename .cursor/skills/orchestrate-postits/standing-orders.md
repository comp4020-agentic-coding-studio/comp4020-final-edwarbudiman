# Standing orders

Every worker reads this first, on every round. When this file and the repo's `CLAUDE.md` disagree, `CLAUDE.md` wins.

1. Work only in your worktree (`.claude/worktrees/<feature>`, branch `feat/<feature>`). Never touch the root checkout, `main`, or another feature's worktree.
2. Never merge, push, rebase, force anything, open a PR or deploy. The owner merges into `main` from root after a manual check.
3. To bring in newer `main`, merge it (`git merge main`), never rebase. Usually `scripts/sync-worktrees.sh` does this for you; don't run it yourself.
4. Stay inside the brief's scope. Files it lists as off limits stay untouched. Something worth doing outside the scope goes in your report under `## Follow-ups`, not into the code.
5. Product, design or rule questions you cannot settle from the brief, `README.md`, `fixed-idea.md` or the ADRs: write them in the report's `ask:` line and stop. Never guess them.
6. Use your feature's ports, never 8080, 5173, 18080 or 18173. They are in your environment (`PORT`, `CLIENT_PORT`, `API_URL`, `VERIFY_SERVER_PORT`, `VERIFY_CLIENT_PORT`) and in `.claude/orch/<feature>/env.sh`. `pnpm dev` already uses `PORT` and `CLIENT_PORT`. Your dev database is `./data` inside your worktree.
7. The checks are `pnpm check` (typecheck and vitest). The specs talk to a running server: start one on `$PORT` with a throwaway `DATA_DIR` and run `APP_URL=http://localhost:$PORT pnpm check`. Run fast, targeted tests while working and the full `pnpm check` once on the final result.
8. Commit in your worktree with plain messages that say what changed and why, ending with the attribution line the session gives you. Never commit secrets; the pre-commit hook blocks API keys.
9. Browser verification uses one shared Chrome. Open your own tab, close it when done, and never close tabs you did not open.
10. Your report is a file, at the path your prompt names. The first line is `token: <the token from your prompt>`, exactly. Then the header, then the body:

```
token: <token>
status: done | blocked | failed
head: <full SHA of feat/<feature> when you finished>
summary: <one to three lines>
ask: <a question for the orchestrator, or "none">

## ... body sections your role file asks for ...
```

A reviewer writes `verdict: approve | changes | blocked` instead of `status:`.

Write the report last, after your final commit, and then end your turn.
