# Orchestration state

The orchestrator's memory for the Herdr pipeline (`.claude/skills/orchestrate-postits/`). After a context compaction, read this and run `scripts/orch/status.sh` before acting.

## Ideas

<!-- One line per live idea: - `slug` — stage (research | decide | spike | taste | build | review) — one-line summary.
     Candidate seeds from earlier brainstorms (not approved, each must go through the loop):
     undo/redo, a "left for you" inbox, named areas on the canvas, find, shortcut help and a
     starter board, archive done notes, a note-details sidebar with proof and comments
     (more-ideas.md), and the spine F (MCP triage), G (discoverability), H (offline). -->

- `label-sections` — brief 2 approved, PR open (reviewer-3 approved 94038cb: filter frames the ticked sections; PR #5 merged 6805847) — zones, no overlap, owner+members edit; drop per-note labels; a toolbar tool draws named label sections on the board that group the notes inside them
- `agent-mcp` — PR open (#8, reviewer-1 approved d7bbdf3, docs page agent.md 14ac5af, main merged in 2296d31, 148 tests pass; spike approved, glow + tag; decision b91cf52: shape A, 8 job tools incl. edit/comment/guarded delete, setup by pasting a message into the agent) — make the app fully agent-able: self-serve API tokens, token-authed API reusing canSee/canEdit, an MCP server at /mcp (read and write), plus a Claude skill. Extends ADR-0001 / checkpoint F. Arranging into sections depends on label-sections
- `agent-discovery` — brief 1 merged (PR #7, 5c5fb2e); brief 2 waits for agent-mcp; small) — checkpoint G: robots/sitemap/llms.txt, markdown negotiation, documented /api with a pointer to tokens and /mcp. Builds after agent-mcp merges

## Decisions

<!-- One line each. Mark the ones the orchestrator settled with
     "(decided by orchestrator)" so the owner can overrule them. -->
- note-sidebar: superseded by the owner's decision.md (2026-11-09). Spike builds two open-button variants behind ?v=a / ?v=b (decided by orchestrator)
- agent-mcp (owner, 2026-11-09): agents can write, not just read. A token acts as its person (same permissions, no scopes or agent identity). Main jobs: read the board; move status forward or mark done; create notes and place them in existing label sections

## To-do for the owner

<!-- Decide sessions, taste gates (with the /taste reminder), merges, blocked dialogs. -->
- `agent-mcp`: PR #8 ready to merge. Try the feature and its page /docs/features/agent/, run /taste, then merge, `scripts/sync-worktrees.sh` and `scripts/orch/retire.sh agent-mcp`. agent-discovery brief 2 is waiting on this merge.
- Route-guard follow-up (from note-sidebar reviewer-5): spec/routes.test.ts misses new SPA pages in main.tsx and `path ===` server dispatch. Migration 7 wipes note statuses on deploy.


## Reflections

<!-- After each merged or rejected idea: date, idea, what to change, and where it was changed. -->
- 2026-11-09, agent-mcp (PR #8, 76456af): three things slowed it. (1) The owner ran `pnpm dev` in the idea worktree without its env.sh, so the client came up on 5173 and proxied /mcp to another worktree's 8080 server; then couldn't log in because each worktree has its own data/app.db. To change: the lead's "Try it" text (and builder/reviewer "How to try it") must give the one-line `source .claude/orch/<idea>/env.sh && mise exec -- pnpm dev` and say local accounts are per worktree (use demo1). Not done yet. (2) The reviewer's cleanup `rm -rf "$(cat …)"` hit an approval dialog twice. To change: roles/reviewer.md: keep temp dirs under one known prefix and rm literal paths. Not done yet. (3) The owner moved past /taste with "all good, continue on"; the lead had to ask the open spike question (glow vs ghost) separately. Fine, but the taste gate text could ask the spike question directly.
- 2026-11-05, note-arrows (in progress): WebSearch/WebFetch can't reach reddit.com, so the researcher had no first-hand Reddit quotes. To fix: give the researcher a working Reddit route (e.g. old.reddit.com .json via curl, or the Chrome tools), then update roles/researcher.md.
- 2026-11-05, note-arrows: the first researcher started without a project brief; added docs/project-context.md and pointed every role at it.
- 2026-11-09, note-arrows: research (~7 min) and the open-ended grilling in decide (~21 min) took longer than the idea needed; the three spikes settled the design anyway (magnetic ends, colour). Owner: "all the things quite simple, but with matt pocock grill it's quite long question so far, also for researching, it takes a lot of time as well, for this simple task". To change: a small/large size at seed; small ideas get light research (5–8 sources, apps + repo, ~10 min cap) and a short decide (one shapes table, then at most 3–5 batched questions each with a recommended default) in roles/researcher.md, roles/decider.md, new-idea.sh. Not done yet.
- 2026-11-09, note-arrows: a re-spike's notes file (.claude/orch/<idea>/spike-<n>-notes.md) isn't named in the spiker's prompt, so the lead sent the path by hand twice. To change: spawn.sh adds it to the prompt when it exists. Not done yet.
- 2026-11-09, note-arrows: sync-worktrees.sh refuses while root has uncommitted changes, so taste commits on main didn't reach the worktrees during the idea.
- 2026-11-09, note-arrows — **for the main pilot:** add a Herdr cleanup step for finished ideas. Owner: "we need to clean the herdr once it's already merged and everything done … something we need to add for the pipeline". After merge, nothing stops the idea's dev/spike servers, closes its tabs, or removes the remote branch. retire.sh only closes the workspace when run with HERDR_ENV=1, and only removes local worktrees/branches. Wanted: one command (retire.sh, or a merge step in the lead) that, once the PR is merged, kills processes on the idea's ports (build, spike, verify), closes the workspace and its agent tabs, removes worktrees and local + remote branches, and marks the idea done in state.md. Who runs it (lead, after the owner's merge, or main) is the pilot's call. Done 2026-11-09: retire.sh now does all of this (workspace closes last, so the lead or main can run it); SKILL.md Merge and README updated.

## Done

<!-- Idea, merge commit or "rejected", date. -->
- note-arrows, PR #2 merge a84d8fd, 2026-11-09
- docs-site, merge 6818997, 2026-11-09, no feature page (the docs site itself)
- note-sidebar, merge 0167ee3, 2026-11-09
