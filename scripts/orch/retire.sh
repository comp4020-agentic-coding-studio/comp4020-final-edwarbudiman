#!/usr/bin/env bash
# retire.sh <idea> [--rejected]
#
# Cleans up an idea after the owner merged it into main: closes the Herdr
# workspace spawn.sh created, removes the worktrees (idea and spike) and
# deletes both branches. Refuses when feat/<idea> is not merged into main or a
# worktree has uncommitted changes. With --rejected, it skips the merge check:
# use it only after the idea's reason is in docs/rejected.md.
# Keeps .claude/orch/<idea>/ (brief and reports).
set -euo pipefail
source "$(dirname "$0")/lib.sh"

name="${1:-}"
check_name "$name"
branch="feat/$name"
wt="$(role_worktree "$name" builder)"
spike_wt="$(role_worktree "$name" spiker)"

if [ "${2:-}" = --rejected ]; then
  grep -Eqi "^#{2,3} $name\b" "$repo_root/docs/rejected.md" ||
    die "add '## $name' with its reason to docs/rejected.md on main first"
else
  git -C "$repo_root" merge-base --is-ancestor "$branch" main ||
    die "$branch is not merged into main; merge it first, or pass --rejected"
fi
for w in "$wt" "$spike_wt"; do
  if [ -d "$w" ] && [ -n "$(git -C "$w" status --porcelain --untracked-files=no)" ]; then
    die "$w has uncommitted changes"
  fi
done

ws="$(cat "$orch_dir/$name/workspace" 2>/dev/null || true)"
if [ -n "$ws" ] && [ "${HERDR_ENV:-}" = 1 ]; then
  herdr workspace close "$ws" >/dev/null 2>&1 || echo "note: workspace $ws was already closed"
fi
[ -d "$spike_wt" ] && git -C "$repo_root" worktree remove --force "$spike_wt"
git -C "$repo_root" branch -D "spike/$name" 2>/dev/null || true
[ -d "$wt" ] && git -C "$repo_root" worktree remove --force "$wt"
if [ "${2:-}" = --rejected ]; then git -C "$repo_root" branch -D "$branch"; else git -C "$repo_root" branch -d "$branch"; fi
awk -v n="$name" '$1 != n' "$orch_dir/ports.tsv" >"$orch_dir/ports.tsv.tmp" && mv "$orch_dir/ports.tsv.tmp" "$orch_dir/ports.tsv"
echo "retired $name"
