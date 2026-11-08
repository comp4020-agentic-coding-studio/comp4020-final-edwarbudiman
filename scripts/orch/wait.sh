#!/usr/bin/env bash
# wait.sh <idea> <role> [timeout-ms]
#
# Blocks until the latest worker of that role settles, then checks its report.
# Prints one line, "<idea> <role-round> <STATUS> ...", and exits:
#   0  report present with this round's token
#   2  worker is blocked on a dialog (the owner answers it)
#   3  worker stopped without a fresh report
# Run it in the background; its exit is the completion event.
set -uo pipefail
source "$(dirname "$0")/lib.sh"

name="${1:-}"
role="${2:-}"
timeout="${3:-3600000}"
check_name "$name"
check_role "$role"
need_herdr

round="$(last_round "$name" "$role")"
[ "$round" -ge 1 ] || die "no $role spawned for $name"
label="$role-$round"
report="$orch_dir/$name/reports/$label.md"
token="$(cat "$orch_dir/$name/reports/$label.token")"
agent="$(agent_name "$name" "$role")"

# Just after a prompt the agent is briefly idle. Wait to see it working (or a
# report already written) before waiting for it to settle.
for _ in $(seq 1 30); do
  [ "$(agent_status "$agent")" = working ] && break
  report_fresh "$report" "$token" && break
  sleep 1
done
herdr agent wait "$agent" --timeout "$timeout" >/dev/null 2>&1
state="$(agent_status "$agent")"

if report_fresh "$report" "$token"; then
  status="$(header_field "$report" "$(report_key "$role")")"
  echo "$name $label ${status:-unknown} head=$(header_field "$report" head) report=$report"
  exit 0
fi
if [ "$state" = blocked ]; then
  echo "$name $label BLOCKED: $agent waits on a dialog. Look at it with: herdr agent focus $agent"
  herdr agent read "$agent" --source recent-unwrapped --lines 25 2>/dev/null | tail -25
  exit 2
fi
echo "$name $label NO-REPORT: $agent is $state and wrote no report for this round"
exit 3
