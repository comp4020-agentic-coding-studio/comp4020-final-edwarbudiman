#!/usr/bin/env bash
# spawn.sh <idea> <lead|researcher|decider|spiker|builder|reviewer> [model]
#
# Starts one worker for an idea in Herdr and returns without waiting.
# One idea = one Herdr workspace (labelled feat/<idea>, like its branch); every worker is a tab.
# The first spawn creates the idea's worktree (.claude/worktrees/<idea>, branch
# feat/<idea>). The spiker gets its own throwaway worktree
# (.claude/worktrees/<idea>-spike, branch spike/<idea>) that is never merged.
#
# The lead is the idea's own orchestrator: spawn it first, in the idea's
# first tab, and it spawns the other roles itself.
# Each role needs the previous stage's file first. The idea's documents live
# in its worktree under docs/ideas/<idea>/ and are committed on feat/<idea>:
#   lead        docs/ideas/<idea>/idea.md       (new-idea.sh writes it)
#   researcher  docs/ideas/<idea>/idea.md
#   decider     docs/ideas/<idea>/research.md
#   spiker      docs/ideas/<idea>/decision.md
#   builder     .claude/orch/<idea>/brief.md
#   reviewer    a builder report
#
# Environment: ORCH_PERMISSION_MODE (default auto) and ORCH_<ROLE>_MODEL,
# e.g. ORCH_BUILDER_MODEL (defaults below).
set -euo pipefail
source "$(dirname "$0")/lib.sh"

name="${1:-}"
role="${2:-}"
check_name "$name"
check_role "$role"
case "$role" in
  lead) default=opus ;;
  researcher) default=opus ;;
  decider) default=opus ;;
  spiker) default=sonnet ;;
  builder) default=sonnet ;;
  reviewer) default=opus ;;
esac
var="ORCH_$(tr a-z A-Z <<<"$role")_MODEL"
model="${3:-${!var:-$default}}"
need_herdr

idea_wt="$(role_worktree "$name" builder)"
idea_docs="$idea_wt/docs/ideas/$name"
[ -d "$idea_wt" ] || die "no idea '$name' yet; start it with scripts/orch/new-idea.sh"
state="$orch_dir/$name"
brief="$state/brief.md"
mkdir -p "$state/reports"

case "$role" in
  lead | researcher) need="$idea_docs/idea.md" ;;
  decider) need="$idea_docs/research.md" ;;
  spiker) need="$idea_docs/decision.md" ;;
  builder) need="$brief" ;;
  reviewer) need="$state/reports/builder-$(last_round "$name" builder).md" ;;
esac
[ -s "$need" ] || die "$role needs $need first (see $skill_dir/SKILL.md)"

wt="$(role_worktree "$name" "$role")"
branch="$(role_branch "$name" "$role")"

# The spike branches from the idea branch, so it sees the idea's documents.
# A re-spike starts again from the idea branch's current head.
if [ "$role" = spiker ] && [ -d "$wt" ] && [ "$(next_round "$name" spiker)" -gt 1 ]; then
  git -C "$wt" merge --no-edit "feat/$name" >/dev/null
fi
if [ "$role" = spiker ] && [ ! -d "$wt" ]; then
  git -C "$repo_root" worktree add "$wt" -b "$branch" "feat/$name"
fi
# A worktree's own .claude/ is mostly gitignored, so copy the local settings
# that carry the course proxy config. Never printed.
if [ -f "$repo_root/.claude/settings.local.json" ] && [ ! -f "$wt/.claude/settings.local.json" ]; then
  mkdir -p "$wt/.claude"
  cp "$repo_root/.claude/settings.local.json" "$wt/.claude/settings.local.json"
fi
# mise pins node and pnpm (mise.toml); a new worktree is untrusted until told.
mise trust -q "$wt" >/dev/null 2>&1 || true
[ -d "$wt/node_modules" ] || (cd "$wt" && mise exec -- pnpm install --frozen-lockfile >/dev/null)

env_args=()
while IFS= read -r kv; do env_args+=(--env "$kv"); done < <(port_env "$name" "$role")
envfile="$state/env.sh"
[ "$role" = spiker ] && envfile="$state/env-spike.sh"
port_env "$name" "$role" | sed 's/^/export /' >"$envfile"

round="$(next_round "$name" "$role")"
label="$role-$round"

# One workspace per idea; each worker is a tab in it.
ws=""
[ -s "$state/workspace" ] && ws="$(cat "$state/workspace")"
if [ -n "$ws" ] && herdr workspace get "$ws" >/dev/null 2>&1; then
  out="$(herdr tab create --workspace "$ws" --cwd "$wt" --label "$label" "${env_args[@]}" --no-focus)"
  pane="$(jq -r '.result.root_pane.pane_id' <<<"$out")"
  tab="$(jq -r '.result.tab.tab_id' <<<"$out")"
else
  out="$(herdr workspace create --cwd "$wt" --label "feat/$name" "${env_args[@]}" --no-focus)"
  ws="$(jq -r '.result.workspace.workspace_id' <<<"$out")"
  pane="$(jq -r '.result.root_pane.pane_id' <<<"$out")"
  tab="$(jq -r '.result.tab.tab_id' <<<"$out")"
  herdr tab rename "$tab" "$label" >/dev/null
  echo "$ws" >"$state/workspace"
fi
[ -n "$pane" ] && [ "$pane" != null ] || die "herdr did not return a pane: $out"

# A new round replaces the previous worker of that role: close its tab, which
# this script created, so only one writer per role is ever live.
agent="$(agent_name "$name" "$role")"
if [ "$round" -gt 1 ]; then
  prev_tab="$(cat "$state/reports/$role-$((round - 1)).tab" 2>/dev/null || true)"
  [ -n "$prev_tab" ] && herdr tab close "$prev_tab" >/dev/null 2>&1 || true
fi
if [ "$(agent_status "$agent")" != gone ]; then
  herdr agent rename "$agent" --clear >/dev/null 2>&1 || true
fi

# Pin the Claude session id so resume.sh can bring this worker back with its
# whole conversation if the session dies.
session="$(uuidgen | tr A-Z a-z)"

# A fresh pane may not show its shell prompt yet: retry while it is busy.
start=""
for _ in 1 2 3 4 5 6 7 8; do
  start="$(herdr agent start "$agent" --kind claude --pane "$pane" --timeout 60000 -- \
    --session-id "$session" --model "$model" --permission-mode "${ORCH_PERMISSION_MODE:-auto}" -n "$name-$label" 2>&1 || true)"
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
report="$state/reports/$label.md"
echo "$token" >"$state/reports/$label.token"
echo "$tab" >"$state/reports/$label.tab"
echo "$session" >"$state/reports/$label.session"
rm -f "$report"

# Short pointer prompt; everything else is in files.
if [ "$role" = lead ]; then
  prompt="You are the lead (the orchestrator) for idea '$name'. Read, in order: $skill_dir/roles/lead.md, $skill_dir/SKILL.md, $repo_root/docs/project-context.md. The repo root is $repo_root; the idea's documents are in $idea_docs; your log is $state/lead.md. Run $repo_root/scripts/orch/status.sh, read what the idea has so far, then tell the owner in two or three lines where the idea stands and what's next."
else
  prompt="You are the $role for idea '$name' (round $round). Read, in order: $skill_dir/standing-orders.md, $skill_dir/roles/$role.md. The idea's documents are in $idea_docs. Project context: $repo_root/docs/project-context.md (read it first). The owner's taste is $repo_root/docs/taste.md and dropped ideas are in $repo_root/docs/rejected.md (read both from root, never edit them). Your worktree is $wt on branch $branch; your ports are in $envfile. The brief, if your role uses one, is $brief. When you finish, write your report to $report. Its first line must be exactly: token: $token"
fi
herdr agent prompt "$agent" "$prompt" >/dev/null

printf '%s\t%s\t%s\t%s\t%s\n' "$(date -u +%FT%TZ)" "$name" "$label" "$agent" "$model" >>"$orch_dir/spawns.tsv"
echo "spawned $agent ($label, $model) in feat/$name ($ws/$pane); report: $report"
