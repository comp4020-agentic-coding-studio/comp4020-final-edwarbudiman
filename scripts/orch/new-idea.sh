#!/usr/bin/env bash
# new-idea.sh <idea> "<one-paragraph seed from the owner>"
#
# Starts an idea: the worktree .claude/worktrees/<idea> on branch feat/<idea>
# from main, and docs/ideas/<idea>/idea.md in it, committed on that branch.
# Does not start Herdr or any agent; spawn.sh <idea> researcher does that.
set -euo pipefail
source "$(dirname "$0")/lib.sh"

name="${1:-}"
seed="${2:-}"
check_name "$name"
[ -n "$seed" ] || die "usage: new-idea.sh <idea> \"<seed paragraph>\""
wt="$(role_worktree "$name" builder)"
[ -d "$wt" ] && die "idea '$name' already exists at $wt"
if grep -Eqi "^#{2,3} $name\b" "$repo_root/docs/rejected.md" 2>/dev/null && [ "${REOPEN:-}" != 1 ]; then
  die "'$name' is in docs/rejected.md. Read its reason; to reopen it anyway, run again with REOPEN=1"
fi

git -C "$repo_root" worktree add -q "$wt" -b "feat/$name" main
mkdir -p "$wt/docs/ideas/$name"
cat >"$wt/docs/ideas/$name/idea.md" <<EOF
# Idea: $name

Started $(date +%F) by the owner.

## Seed

$seed
EOF
git -C "$wt" add "docs/ideas/$name/idea.md"
git -C "$wt" commit -q -m "Start idea $name"
mkdir -p "$orch_dir/$name/reports"
port_slot "$name" >/dev/null
echo "idea $name: $wt on feat/$name. Next: scripts/orch/spawn.sh $name researcher"
