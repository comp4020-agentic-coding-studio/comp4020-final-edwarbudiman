#!/usr/bin/env bash
# Merge the root repo's main branch into every linked worktree's branch.
#
# Run from anywhere; it always operates on the repo containing this script.
set -euo pipefail

repo_root="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
cd "$repo_root"

main_branch="main"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "error: $main_branch has uncommitted changes in $repo_root. Commit or stash them first." >&2
  exit 1
fi

current_branch="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$current_branch" != "$main_branch" ]]; then
  echo "error: root worktree is on '$current_branch', expected '$main_branch'." >&2
  exit 1
fi

echo "Syncing worktrees onto $main_branch ($(git rev-parse --short "$main_branch"))..."

failed=()

while IFS= read -r line; do
  wt_path="$(awk '{print $1}' <<<"$line")"
  branch="$(sed -n "s/.*\[\(.*\)\]/\1/p" <<<"$line")"

  # Skip the root worktree (already on main) and bare/detached entries.
  [[ "$wt_path" == "$repo_root" ]] && continue
  [[ -z "$branch" ]] && continue

  echo
  echo "== $branch ($wt_path) =="

  # Untracked files are fine: git merge refuses to overwrite them on its own.
  if [[ -n "$(git -C "$wt_path" status --porcelain --untracked-files=no)" ]]; then
    echo "skipped: uncommitted changes in $wt_path" >&2
    failed+=("$branch (uncommitted changes)")
    continue
  fi

  if git -C "$wt_path" merge "$main_branch" -m "Merge $main_branch into $branch"; then
    echo "ok: $branch up to date with $main_branch"
  else
    echo "error: merge conflict in $wt_path -- resolve manually" >&2
    failed+=("$branch (merge conflict)")
  fi
done < <(git worktree list)

echo
if [[ ${#failed[@]} -gt 0 ]]; then
  echo "Done with issues:"
  printf '  - %s\n' "${failed[@]}"
  exit 1
fi

echo "All worktrees up to date with $main_branch."
