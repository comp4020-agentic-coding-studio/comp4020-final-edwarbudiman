#!/usr/bin/env bash
# resume.sh <idea> <role | role-N>
#
# Brings a worker back after its Claude session died (Herdr restart, closed
# pane, crash), with its whole conversation, instead of starting a new round.
# The round, report path and token stay the same, so wait.sh and status.sh
# keep working as if the worker never stopped.
#
#   resume.sh note-arrows lead        the idea's lead
#   resume.sh note-arrows builder     the latest builder round
#   resume.sh note-arrows spiker-2    a specific round
#
# Finds the session from .claude/orch/<idea>/reports/<label>.session (written
# by spawn.sh), or else from the Claude transcripts of the role's worktree, by
# the spawn prompt. Reuses the worker's old tab when its pane is back at a
# shell prompt, otherwise opens a new tab in the idea's workspace.
# Refuses while that worker's agent is still live.
set -euo pipefail
source "$(dirname "$0")/lib.sh"

name="${1:-}"
arg="${2:-}"
check_name "$name"
case "$arg" in
  *-[0-9]*) role="${arg%-*}"; round="${arg##*-}" ;;
  *) role="$arg"; round="" ;;
esac
check_role "$role"
need_herdr

state="$orch_dir/$name"
reports="$state/reports"
[ -d "$reports" ] || die "no runs for '$name' yet"
[ -n "$round" ] || round="$(last_round "$name" "$role")"
[ "$round" -ge 1 ] || die "$role was never spawned for '$name'; use spawn.sh"
label="$role-$round"
[ -e "$reports/$label.token" ] || die "no $label for '$name'"

agent="$(agent_name "$name" "$role")"
status="$(agent_status "$agent")"
[ "$status" = gone ] || die "$agent is still live ($status); talk to it in its tab instead"

wt="$(role_worktree "$name" "$role")"
[ -d "$wt" ] || die "worktree $wt is gone"

# Model: the one this round was spawned with.
model="$(awk -F'\t' -v n="$name" -v l="$label" '$2 == n && $3 == l { m = $5 } END { print m }' "$orch_dir/spawns.tsv")"
[ -n "$model" ] || model=sonnet

# Session id: recorded at spawn, or found by the spawn prompt.
session="$(cat "$reports/$label.session" 2>/dev/null || true)"
if [ -z "$session" ]; then
  projects="$HOME/.claude/projects/$(sed 's#[/.]#-#g' <<<"$wt")"
  if [ "$role" = lead ]; then
    want="You are the lead (the orchestrator) for idea '$name'"
  else
    want="You are the $role for idea '$name' (round $round)"
  fi
  # Newest transcript whose first user message is this worker's spawn prompt.
  for f in $(ls -t "$projects"/*.jsonl 2>/dev/null); do
    first="$(jq -r 'select(.type == "user") | .message.content
      | if type == "string" then . else (map(.text? // "") | join("")) end' "$f" 2>/dev/null | head -c 400)"
    # Herdr may wrap the prompt (e.g. in a paste tag), so match it anywhere near the start.
    case "$first" in *"$want"*) session="$(basename "$f" .jsonl)"; break ;; esac
  done
  [ -n "$session" ] || die "no Claude session found for $label in $projects; spawn a new round instead"
  echo "$session" >"$reports/$label.session"
fi

# Pane: the old tab's pane if it is still there, else a new tab.
pane=""
tab="$(cat "$reports/$label.tab" 2>/dev/null || true)"
ws="$(cat "$state/workspace" 2>/dev/null || true)"
if [ -n "$tab" ] && [ -n "$ws" ]; then
  pane="$(herdr pane list --workspace "$ws" 2>/dev/null | jq -r --arg t "$tab" '.result.panes[]? | select(.tab_id == $t) | .pane_id' | head -1)"
fi
if [ -z "$pane" ]; then
  env_args=()
  while IFS= read -r kv; do env_args+=(--env "$kv"); done < <(port_env "$name" "$role")
  if [ -n "$ws" ] && herdr workspace get "$ws" >/dev/null 2>&1; then
    out="$(herdr tab create --workspace "$ws" --cwd "$wt" --label "$label" "${env_args[@]}" --no-focus)"
  else
    out="$(herdr workspace create --cwd "$wt" --label "feat/$name" "${env_args[@]}" --no-focus)"
    ws="$(jq -r '.result.workspace.workspace_id' <<<"$out")"
    echo "$ws" >"$state/workspace"
    herdr tab rename "$(jq -r '.result.tab.tab_id' <<<"$out")" "$label" >/dev/null
  fi
  pane="$(jq -r '.result.root_pane.pane_id' <<<"$out")"
  jq -r '.result.tab.tab_id' <<<"$out" >"$reports/$label.tab"
fi
[ -n "$pane" ] && [ "$pane" != null ] || die "no pane to resume in"

start=""
for _ in 1 2 3 4 5 6 7 8; do
  start="$(herdr agent start "$agent" --kind claude --pane "$pane" --timeout 60000 -- \
    --resume "$session" --model "$model" --permission-mode "${ORCH_PERMISSION_MODE:-auto}" -n "$name-$label" 2>&1 || true)"
  grep -q agent_pane_busy <<<"$start" || break
  sleep 2
done
grep -q '"error"' <<<"$start" && die "agent start failed in pane $pane (is it at a shell prompt?): $start"

report="$reports/$label.md"
token="$(cat "$reports/$label.token")"
if [ "$role" = lead ]; then
  msg="Your session ended and was resumed by scripts/orch/resume.sh. Read your log $state/lead.md, run $repo_root/scripts/orch/status.sh, and check whether your workers are gone (STATE gone with no RESULT). Resume a gone worker with $repo_root/scripts/orch/resume.sh $name <role> instead of spawning a new round, and restart any wait.sh you were running. Then tell the owner in two or three lines where the idea stands."
elif report_fresh "$report" "$token"; then
  msg="Your session ended and was resumed by scripts/orch/resume.sh. Your report $report is already written; stay available for follow-ups from the owner or the lead."
else
  msg="Your session ended and was resumed by scripts/orch/resume.sh. Check git status and git log in your worktree to see what you already did, then carry on with your task. Restart any dev server you need. When you finish, write your report to $report; its first line must be exactly: token: $token"
fi
herdr agent prompt "$agent" "$msg" >/dev/null

printf '%s\t%s\t%s\t%s\t%s\n' "$(date -u +%FT%TZ)" "$name" "$label" "$agent" "$model" >>"$orch_dir/resumes.tsv"
echo "resumed $agent ($label, $model, session $session) in feat/$name ($pane); report: $report"
