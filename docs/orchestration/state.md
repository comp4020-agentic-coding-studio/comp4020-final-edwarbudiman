# Orchestration state

The orchestrator's memory for the Herdr pipeline (`.claude/skills/orchestrate-postits/`). After a context compaction, read this and run `scripts/orch/status.sh` before acting.

## Ideas

<!-- One line per live idea: - `slug` — stage (research | decide | spike | taste | build | review) — one-line summary.
     Candidate seeds from earlier brainstorms (not approved, each must go through the loop):
     undo/redo, a "left for you" inbox, named areas on the canvas, find, shortcut help and a
     starter board, archive done notes, a note-details sidebar with proof and comments
     (more-ideas.md), and the spine F (MCP triage), G (discoverability), H (offline). -->

- `note-sidebar` — review (reviewer-2) — per-user status, creator-only proof checkbox, comments, in a sidebar opened by a button on the note

## Decisions

<!-- One line each. Mark the ones the orchestrator settled with
     "(decided by orchestrator)" so the owner can overrule them. -->
- note-sidebar: superseded by the owner's decision.md (2026-11-09). Spike builds two open-button variants behind ?v=a / ?v=b (decided by orchestrator)

## To-do for the owner

<!-- Decide sessions, taste gates (with the /taste reminder), merges, blocked dialogs. -->
- `note-sidebar`: reviewer-1 asked for changes (the +N pill is clipped in crowd rows); builder-2 fixing, then reviewer-2, then the owner's last check, PR and merge.

## Reflections

<!-- After each merged or rejected idea: date, idea, what to change, and where it was changed. -->
- 2026-11-05, note-arrows (in progress): WebSearch/WebFetch can't reach reddit.com, so the researcher had no first-hand Reddit quotes. To fix: give the researcher a working Reddit route (e.g. old.reddit.com .json via curl, or the Chrome tools), then update roles/researcher.md.
- 2026-11-05, note-arrows: the first researcher started without a project brief; added docs/project-context.md and pointed every role at it.
- 2026-11-09, note-arrows: research (~7 min) and the open-ended grilling in decide (~21 min) took longer than the idea needed; the three spikes settled the design anyway (magnetic ends, colour). Owner: "all the things quite simple, but with matt pocock grill it's quite long question so far, also for researching, it takes a lot of time as well, for this simple task". To change: a small/large size at seed; small ideas get light research (5–8 sources, apps + repo, ~10 min cap) and a short decide (one shapes table, then at most 3–5 batched questions each with a recommended default) in roles/researcher.md, roles/decider.md, new-idea.sh. Not done yet.
- 2026-11-09, note-arrows: a re-spike's notes file (.claude/orch/<idea>/spike-<n>-notes.md) isn't named in the spiker's prompt, so the lead sent the path by hand twice. To change: spawn.sh adds it to the prompt when it exists. Not done yet.
- 2026-11-09, note-arrows: sync-worktrees.sh refuses while root has uncommitted changes, so taste commits on main didn't reach the worktrees during the idea.
- 2026-11-09, note-arrows — **for the main pilot:** add a Herdr cleanup step for finished ideas. Owner: "we need to clean the herdr once it's already merged and everything done … something we need to add for the pipeline". After merge, nothing stops the idea's dev/spike servers, closes its tabs, or removes the remote branch. retire.sh only closes the workspace when run with HERDR_ENV=1, and only removes local worktrees/branches. Wanted: one command (retire.sh, or a merge step in the lead) that, once the PR is merged, kills processes on the idea's ports (build, spike, verify), closes the workspace and its agent tabs, removes worktrees and local + remote branches, and marks the idea done in state.md. Who runs it (lead, after the owner's merge, or main) is the pilot's call. Done 2026-11-09: retire.sh now does all of this (workspace closes last, so the lead or main can run it); SKILL.md Merge and README updated.

## Done

<!-- Idea, merge commit or "rejected", date. -->
- note-arrows, PR #2 merge a84d8fd, 2026-11-09
- docs-site, merge 6818997, 2026-11-09
