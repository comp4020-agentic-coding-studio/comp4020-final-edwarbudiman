#!/usr/bin/env bash
# retire.sh <idea> [--rejected]
#
# Cleans up an idea once it is finished, in one go:
#   1. stops anything still listening on the idea's ports (build, spike, verify)
#   2. removes both worktrees (idea and spike) and deletes both local branches
#   3. deletes feat/<idea> on origin, if it is still there
#   4. updates docs/orchestration/state.md: drops the idea's lines from Ideas and
#      To-do, adds a Done line (merge commit or "rejected") if there isn't one
#   5. frees its port slot and closes its Herdr workspace with all its agent tabs
# The workspace closes last, so a lead can run this from inside it.
#
# Refuses when feat/<idea> is not merged into main (merge the PR, then `git pull`
# in root first) or a worktree has uncommitted changes. With --rejected it skips
# the merge check: use it only after the idea's reason is in docs/rejected.md.
# Keeps .claude/orch/<idea>/ (brief and reports). Commit state.md afterwards.
set -euo pipefail
source "$(dirname "$0")/lib.sh"

name="${1:-}"
check_name "$name"
rejected=0
[ "${2:-}" = --rejected ] && rejected=1
branch="feat/$name"
wt="$(role_worktree "$name" builder)"
spike_wt="$(role_worktree "$name" spiker)"
state="$repo_root/docs/orchestration/state.md"

if [ "$rejected" = 1 ]; then
  grep -Eqi "^#{2,3} $name\b" "$repo_root/docs/rejected.md" ||
    die "add '## $name' with its reason to docs/rejected.md on main first"
elif git -C "$repo_root" rev-parse -q --verify "refs/heads/$branch" >/dev/null; then
  git -C "$repo_root" merge-base --is-ancestor "$branch" main ||
    die "$branch is not merged into main; merge it (or pull the merged PR) first, or pass --rejected"
fi
for w in "$wt" "$spike_wt"; do
  if [ -d "$w" ] && [ -n "$(git -C "$w" status --porcelain --untracked-files=no)" ]; then
    die "$w has uncommitted changes"
  fi
done

# 1. Servers. Read the ports before the slot is freed below.
if grep -q "^$name	" "$orch_dir/ports.tsv" 2>/dev/null; then
  ports="$( { port_env "$name"; port_env "$name" spiker; } | awk -F= '$1 ~ /PORT$/ { print $2 }')"
  for p in $ports; do
    pids="$(lsof -t -nP -iTCP:"$p" -sTCP:LISTEN 2>/dev/null || true)"
    [ -n "$pids" ] || continue
    echo "stopping port $p (pid $(echo $pids))"
    kill $pids 2>/dev/null || true
  done
fi

# 2. Worktrees and local branches.
[ -d "$spike_wt" ] && git -C "$repo_root" worktree remove --force "$spike_wt"
git -C "$repo_root" branch -D "spike/$name" >/dev/null 2>&1 || true
[ -d "$wt" ] && git -C "$repo_root" worktree remove --force "$wt"
if git -C "$repo_root" rev-parse -q --verify "refs/heads/$branch" >/dev/null; then
  # sync-worktrees.sh may have merged main into the branch after the PR, so look
  # for the merge from the pushed tip when there is one. -D is safe: the merge
  # check above already proved the branch is in main (git -d would compare it
  # with origin/feat/<idea> instead).
  tip="$branch"
  git -C "$repo_root" rev-parse -q --verify "refs/remotes/origin/$branch" >/dev/null && tip="origin/$branch"
  merge="$(git -C "$repo_root" rev-list --ancestry-path --merges "$tip..main" | tail -1)"
  git -C "$repo_root" branch -D "$branch"
fi
git -C "$repo_root" worktree prune

# 3. Remote branch.
if git -C "$repo_root" ls-remote --exit-code --heads origin "$branch" >/dev/null 2>&1; then
  git -C "$repo_root" push -q origin --delete "$branch" && echo "deleted origin/$branch"
fi
git -C "$repo_root" fetch -q --prune origin 2>/dev/null || true

# 4. state.md.
if [ -f "$state" ]; then
  if [ "$rejected" = 1 ]; then outcome=rejected; else outcome="merge $(git -C "$repo_root" rev-parse --short "${merge:-main}")"; fi
  done_line="- $name, $outcome, $(date +%Y-%m-%d)"
  awk -v n="$name" -v d="$done_line" '
    /^## / { sec = $0 }
    (sec == "## Ideas" || sec == "## To-do for the owner") && index($0, "- `" n "`") == 1 { next }
    sec == "## Done" && index($0, "- " n ",") == 1 { have = 1 }
    { print }
    END { if (!have) print d }
  ' "$state" >"$state.tmp" && mv "$state.tmp" "$state"
fi

# 5. Ports and Herdr.
awk -v n="$name" '$1 != n' "$orch_dir/ports.tsv" >"$orch_dir/ports.tsv.tmp" && mv "$orch_dir/ports.tsv.tmp" "$orch_dir/ports.tsv"
ws="$(cat "$orch_dir/$name/workspace" 2>/dev/null || true)"
echo "retired $name (commit docs/orchestration/state.md)"
if [ -n "$ws" ] && command -v herdr >/dev/null; then
  rm -f "$orch_dir/$name/workspace"
  herdr workspace close "$ws" >/dev/null 2>&1 && echo "closed Herdr workspace $ws" ||
    echo "note: workspace $ws was already closed"
fi
