#!/usr/bin/env bash
# retire.sh <feature>
#
# Cleans up a feature after the owner merged it into main: closes the Herdr
# workspace spawn.sh created, removes the worktree and deletes the branch.
# Refuses when the branch is not merged into main or the worktree has
# uncommitted changes. Keeps .claude/orch/<feature>/ (brief and reports).
set -euo pipefail
source "$(dirname "$0")/lib.sh"

name="${1:-}"
check_name "$name"
branch="feat/$name"
wt="$repo_root/.claude/worktrees/$name"

git -C "$repo_root" merge-base --is-ancestor "$branch" main ||
  die "$branch is not merged into main; merge it first (or remove it by hand)"
if [ -d "$wt" ] && [ -n "$(git -C "$wt" status --porcelain --untracked-files=no)" ]; then
  die "$wt has uncommitted changes"
fi

ws="$(cat "$orch_dir/$name/workspace" 2>/dev/null || true)"
if [ -n "$ws" ] && [ "${HERDR_ENV:-}" = 1 ]; then
  herdr workspace close "$ws" >/dev/null 2>&1 || echo "note: workspace $ws was already closed"
fi
[ -d "$wt" ] && git -C "$repo_root" worktree remove --force "$wt"
git -C "$repo_root" branch -d "$branch"
awk -v n="$name" '$1 != n' "$orch_dir/ports.tsv" >"$orch_dir/ports.tsv.tmp" && mv "$orch_dir/ports.tsv.tmp" "$orch_dir/ports.tsv"
echo "retired $name"
