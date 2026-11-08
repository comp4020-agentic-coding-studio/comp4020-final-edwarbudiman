# Orchestration state

The orchestrator's memory for the Herdr pipeline (`.claude/skills/orchestrate-postits/`). After a context compaction, read this and run `scripts/orch/status.sh` before acting.

## Ideas

<!-- One line per live idea: - `slug` — stage (research | decide | spike | taste | build | review) — one-line summary.
     Candidate seeds from earlier brainstorms (not approved, each must go through the loop):
     undo/redo, a "left for you" inbox, named areas on the canvas, find, shortcut help and a
     starter board, archive done notes, a note-details sidebar with proof and comments
     (more-ideas.md), and the spine F (MCP triage), G (discoverability), H (offline). -->

- `note-arrows` — taste (spike-3) — re-style notes with arrows that show order and which note affects which (dry run of the new pipeline)
- `note-sidebar` — research — right sidebar per note with optional Proof (text or image) and Comments; single click opens it

## Decisions

<!-- One line each. Mark the ones the orchestrator settled with
     "(decided by orchestrator)" so the owner can overrule them. -->
- note-sidebar: only a click without movement opens the sidebar; images shrunk client-side to ~200 KB, ~5 proof items per note; a comment/proof marker on the note; bottom sheet on phones (decided by orchestrator)

## To-do for the owner

<!-- Decide sessions, taste gates (with the /taste reminder), merges, blocked dialogs. -->
- `note-arrows`: spike-2 ready at http://localhost:5188 — try it and run /taste in the lead-1 tab of workspace `feat/note-arrows`. Its lead now runs this idea.
- `note-sidebar`: lead started in workspace `feat/note-sidebar`; research comes next, then the decide conversation there.

## Reflections

<!-- After each merged or rejected idea: date, idea, what to change, and where it was changed. -->
- 2026-11-05, note-arrows (in progress): WebSearch/WebFetch can't reach reddit.com, so the researcher had no first-hand Reddit quotes. To fix: give the researcher a working Reddit route (e.g. old.reddit.com .json via curl, or the Chrome tools), then update roles/researcher.md.
- 2026-11-05, note-arrows: the first researcher started without a project brief; added docs/project-context.md and pointed every role at it.

## Done

<!-- Idea, merge commit or "rejected", date. -->
