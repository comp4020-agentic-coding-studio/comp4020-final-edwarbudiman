---
name: taste
description: Save the owner's reaction to something they just tried (a spike, a reviewed feature, the live app) into docs/taste.md, then ask what happens next for that idea. Use for /taste, or when the owner gives feedback like "I like…", "this feels…", "too many…" about Post-its' look or behaviour.
argument-hint: "[idea] what you think, in plain words"
---

# Taste

The owner's taste is the project's design memory. `docs/taste.md` in the root checkout (on `main`) holds it, and every researcher, spiker, builder and reviewer reads it. This skill turns a plain reaction into lines there.

## Steps

1. **Find the idea.** Use the idea named in the arguments. If none is named, use the idea whose spike or review the owner was most recently shown in this session. If that's unclear, list the ideas from `scripts/orch/status.sh` and ask which one.
2. **Get the reaction.** If the arguments already have it, use them. Otherwise ask one question: "What did you think? Say it in plain words." Don't make them fill in a form.
3. **Sort it.** Split what they said into lines, each one of:
   - `Like`: something to keep doing.
   - `Dislike`: something to avoid.
   - `Rule`: something they want enforced every time ("never", "always"). Only call it a rule if they said it that strongly; otherwise it's a like or dislike.
   Keep their words. Add a short "because" only when they gave one.
4. **Show, then save.** Show the lines you will add and ask "Save these?" in one line. On yes, in the root checkout:
   - Add the lines to the matching sections of `docs/taste.md`, each ending with `(<idea>, <YYYY-MM-DD>)`.
   - Add a dated entry under `## Log` with the idea, what was tried (spike round or review round) and their reaction in their words.
   - Commit on `main` with a message like `taste: <idea> spike-1 notes`, then run `scripts/sync-worktrees.sh` so every worktree sees the update.
   If root has unrelated uncommitted changes, commit only `docs/taste.md`.
5. **Ask what next**, with three choices:
   - **Build it**: the orchestrator writes the brief from `decision.md` plus these notes.
   - **Re-spike**: `scripts/orch/spawn.sh <idea> spiker` again, which reads these notes.
   - **Reject**: the orchestrator adds the idea and the reason under `## Rejected` in `docs/rejected.md`, then `scripts/orch/retire.sh <idea> --rejected`.
   Do only what they choose. If this session isn't the orchestrator, tell them to say it in the orchestrator's tab.

## Keeping taste.md useful

When a new line repeats an existing one, strengthen the existing line (add the new date) instead of adding a duplicate. When it contradicts one, show both and ask which one stands.
