#!/usr/bin/env bash
# status.sh: one row per feature with its latest builder and reviewer, their
# Herdr state, the report verdict, and the branch head compared with the
# commit the reviewer passed.
set -uo pipefail
source "$(dirname "$0")/lib.sh"

[ -d "$orch_dir" ] || { echo "no features yet ($orch_dir)"; exit 0; }
printf '%-20s %-12s %-9s %-9s %-12s %-9s %-9s %s\n' FEATURE BUILDER STATE REPORT REVIEWER STATE VERDICT HEAD
for feat in "$orch_dir"/*/; do
  name="$(basename "$feat")"
  [ -s "$feat/brief.md" ] || continue
  row=("$name")
  for role in builder reviewer; do
    round="$(last_round "$name" "$role")"
    if [ "$round" -lt 1 ]; then row+=(- - -); continue; fi
    label="$role-$round"
    report="$feat/reports/$label.md"
    token="$(cat "$feat/reports/$label.token")"
    verdict=-
    if report_fresh "$report" "$token"; then
      key=status
      [ "$role" = reviewer ] && key=verdict
      verdict="$(header_field "$report" "$key")"
    fi
    row+=("$label" "$(agent_status "$(agent_name "$name" "$role")")" "${verdict:-?}")
  done
  head="$(git -C "$repo_root" rev-parse --short "feat/$name" 2>/dev/null || echo -)"
  rv="$feat/reports/reviewer-$(last_round "$name" reviewer).md"
  if [ -s "$rv" ]; then
    passed="$(header_field "$rv" head)"
    case "$passed" in "$head"*) ;; "") ;; *) head="$head (reviewed ${passed:0:7}, stale)" ;; esac
  fi
  printf '%-20s %-12s %-9s %-9s %-12s %-9s %-9s %s\n' "${row[@]}" "$head"
done
