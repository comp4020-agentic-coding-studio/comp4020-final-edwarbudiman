#!/usr/bin/env bash
# status.sh: one row per idea with its stage, its latest worker, that worker's
# Herdr state and report result, and the branch head compared with the commit
# the reviewer passed.
set -uo pipefail
source "$(dirname "$0")/lib.sh"

[ -d "$orch_dir" ] || { echo "no ideas yet ($orch_dir)"; exit 0; }

# The stage an idea is at, from which of its files exist.
stage() {
  local d="$(role_worktree "$1" builder)/docs/ideas/$1" s="$orch_dir/$1"
  if [ -s "$s/reports/documenter-$(last_round "$1" documenter).md" ]; then echo docs
  elif [ -s "$s/reports/reviewer-$(last_round "$1" reviewer).md" ]; then echo review
  elif [ -s "$s/brief.md" ]; then echo build
  elif [ -s "$d/decision.md" ]; then echo spike/taste
  elif [ -s "$d/research.md" ]; then echo decide
  elif [ -s "$d/idea.md" ]; then echo research
  else echo -; fi
}

printf '%-18s %-12s %-14s %-9s %-11s %s\n' IDEA STAGE LATEST STATE RESULT HEAD
for dir in "$orch_dir"/*/; do
  name="$(basename "$dir")"
  [ -d "$(role_worktree "$name" builder)" ] || continue
  latest=- state=- result=-
  last="$(awk -F'\t' -v n="$name" '$2 == n { l = $3 } END { print l }' "$orch_dir/spawns.tsv" 2>/dev/null)"
  if [ -n "$last" ]; then
    role="${last%-*}"
    latest="$last"
    state="$(agent_status "$(agent_name "$name" "$role")")"
    report="$dir/reports/$last.md"
    token="$(cat "$dir/reports/$last.token" 2>/dev/null)"
    if report_fresh "$report" "$token"; then result="$(header_field "$report" "$(report_key "$role")")"; fi
  fi
  head="$(git -C "$repo_root" rev-parse --short "feat/$name" 2>/dev/null || echo -)"
  rv="$dir/reports/reviewer-$(last_round "$name" reviewer).md"
  if [ -s "$rv" ]; then
    passed="$(header_field "$rv" head)"
    case "$passed" in "$head"*) ;; "") ;; *) head="$head (reviewed ${passed:0:7}, stale)" ;; esac
  fi
  printf '%-18s %-12s %-14s %-9s %-11s %s\n' "$name" "$(stage "$name")" "$latest" "$state" "${result:-?}" "$head"
done
