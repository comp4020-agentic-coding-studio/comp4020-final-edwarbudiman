#!/usr/bin/env bash
# spawn.sh <feature> <builder|reviewer> [model]
#
# Starts one worker for a feature in Herdr and returns without waiting.
# The first builder creates the worktree (.claude/worktrees/<feature>, branch
# feat/<feature>) and its Herdr workspace. A later builder (a fix round) or a
# reviewer gets a new tab in that workspace. The worker reads its brief from
# .claude/orch/<feature>/brief.md and writes its report next to it.
#
# Environment: ORCH_PERMISSION_MODE (default auto), ORCH_BUILDER_MODEL
# (default sonnet), ORCH_REVIEWER_MODEL (default opus).
set -euo pipefail
source "$(dirname "$0")/lib.sh"

name="${1:-}"
role="${2:-}"
check_name "$name"
case "$role" in
  builder) model="${3:-${ORCH_BUILDER_MODEL:-sonnet}}" ;;
  reviewer) model="${3:-${ORCH_REVIEWER_MODEL:-opus}}" ;;
  *) die "usage: spawn.sh <feature> <builder|reviewer> [model]" ;;
esac
need_herdr

feat="$orch_dir/$name"
brief="$feat/brief.md"
[ -s "$brief" ] || die "write the brief first: $brief (template: $skill_dir/brief-template.md)"
wt="$repo_root/.claude/worktrees/$name"
branch="feat/$name"
mkdir -p "$feat/reports"

if [ "$role" = reviewer ] && [ ! -d "$wt" ]; then
  die "no worktree for $name yet; spawn a builder first"
fi

# Worktree, created from main as CLAUDE.md describes.
if [ ! -d "$wt" ]; then
  git -C "$repo_root" worktree add "$wt" -b "$branch" main
fi
# The worktree's own .claude/ is empty (gitignored), so copy the local
# settings that carry the course proxy config. Never printed.
if [ -f "$repo_root/.claude/settings.local.json" ] && [ ! -f "$wt/.claude/settings.local.json" ]; then
  mkdir -p "$wt/.claude"
  cp "$repo_root/.claude/settings.local.json" "$wt/.claude/settings.local.json"
fi
# mise pins node and pnpm (mise.toml); a new worktree is untrusted until told.
mise trust -q "$wt" >/dev/null 2>&1 || true
[ -d "$wt/node_modules" ] || (cd "$wt" && mise exec -- pnpm install --frozen-lockfile >/dev/null)

env_args=()
while IFS= read -r kv; do env_args+=(--env "$kv"); done < <(port_env "$name")
port_env "$name" | sed 's/^/export /' >"$feat/env.sh"

round="$(next_round "$name" "$role")"
label="$role-$round"

# One workspace per feature; each worker is a tab in it.
ws=""
[ -s "$feat/workspace" ] && ws="$(cat "$feat/workspace")"
if [ -n "$ws" ] && herdr workspace get "$ws" >/dev/null 2>&1; then
  out="$(herdr tab create --workspace "$ws" --cwd "$wt" --label "$label" "${env_args[@]}" --no-focus)"
  pane="$(jq -r '.result.root_pane.pane_id' <<<"$out")"
  tab="$(jq -r '.result.tab.tab_id' <<<"$out")"
else
  out="$(herdr workspace create --cwd "$wt" --label "$branch" "${env_args[@]}" --no-focus)"
  ws="$(jq -r '.result.workspace.workspace_id' <<<"$out")"
  pane="$(jq -r '.result.root_pane.pane_id' <<<"$out")"
  tab="$(jq -r '.result.tab.tab_id' <<<"$out")"
  herdr tab rename "$tab" "$label" >/dev/null
  echo "$ws" >"$feat/workspace"
fi
[ -n "$pane" ] && [ "$pane" != null ] || die "herdr did not return a pane: $out"

# A new round replaces the previous worker of that role: close its tab, which
# this script created, so only one writer is ever live in the worktree.
agent="$(agent_name "$name" "$role")"
if [ "$round" -gt 1 ]; then
  prev_tab="$(cat "$feat/reports/$role-$((round - 1)).tab" 2>/dev/null || true)"
  [ -n "$prev_tab" ] && herdr tab close "$prev_tab" >/dev/null 2>&1 || true
fi
if [ "$(agent_status "$agent")" != gone ]; then
  herdr agent rename "$agent" --clear >/dev/null 2>&1 || true
fi

# A fresh pane may not show its shell prompt yet: retry while it is busy.
start=""
for _ in 1 2 3 4 5 6 7 8; do
  start="$(herdr agent start "$agent" --kind claude --pane "$pane" --timeout 60000 -- \
    --model "$model" --permission-mode "${ORCH_PERMISSION_MODE:-auto}" -n "$name-$label" 2>&1 || true)"
  grep -q agent_pane_busy <<<"$start" || break
  sleep 2
done
# Answer only the first-run "trust this folder" dialog, and only for our own
# worktree. Any other blocked dialog is left for the owner.
if grep -q agent_not_ready <<<"$start"; then
  if herdr pane read "$pane" --source recent-unwrapped --lines 40 | grep -qi "trust this folder"; then
    herdr pane send-keys "$pane" enter >/dev/null
    for _ in $(seq 1 15); do
      sleep 2
      [ "$(agent_status "$agent")" = idle ] && { start=""; break; }
    done
  fi
fi
if grep -q '"error"' <<<"$start"; then
  die "agent start failed in pane $pane: $start"
fi

token="$(od -An -N6 -tx1 /dev/urandom | tr -d ' \n')"
report="$feat/reports/$label.md"
echo "$token" >"$feat/reports/$label.token"
echo "$tab" >"$feat/reports/$label.tab"
rm -f "$report"

# Short pointer prompt; everything else is in files.
prompt="You are the $role for feature '$name' (round $round). Read, in order: $skill_dir/standing-orders.md, $skill_dir/roles/$role.md, then the brief at $brief. Your worktree is $wt on branch $branch; your ports are in $feat/env.sh. When you finish, write your report to $report. Its first line must be exactly: token: $token"
herdr agent prompt "$agent" "$prompt" >/dev/null

printf '%s\t%s\t%s\t%s\t%s\n' "$(date -u +%FT%TZ)" "$name" "$label" "$agent" "$model" >>"$orch_dir/spawns.tsv"
echo "spawned $agent ($label, $model) in $ws/$pane; report: $report"
