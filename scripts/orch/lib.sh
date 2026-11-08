#!/usr/bin/env bash
# Shared helpers for the orchestration scripts. Sourced, not run.
# Runtime state lives in .claude/orch/ (gitignored): one folder per idea.

repo_root="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --path-format=absolute --git-common-dir)"
repo_root="$(dirname "$repo_root")"
orch_dir="$repo_root/.claude/orch"
skill_dir="$repo_root/.claude/skills/orchestrate-postits"

die() { echo "error: $*" >&2; exit 1; }

need_herdr() {
  [ "${HERDR_ENV:-}" = 1 ] || die "not running inside a Herdr pane"
  command -v jq >/dev/null || die "jq is required"
}

# Idea names (slugs) become branch names, folder names and part of agent names.
check_name() {
  case "$1" in
    "" | *[![:lower:][:digit:]-]* | -*) die "idea name must be lowercase letters, digits and dashes: '$1'" ;;
  esac
  [ ${#1} -le 24 ] || die "idea name must be at most 24 characters: '$1'"
}

# The idea's lead (its own orchestrator), then the stages in order. Each is
# one worker role with roles/<role>.md.
roles="lead researcher decider spiker builder reviewer"
check_role() {
  case " $roles " in *" $1 "*) ;; *) die "role must be one of: $roles" ;; esac
}

# Herdr agent names must match [a-z][a-z0-9_-]{0,31}.
agent_name() {
  local p
  case "$2" in lead) p=l ;; researcher) p=rs ;; decider) p=d ;; spiker) p=s ;; builder) p=b ;; reviewer) p=r ;; esac
  echo "$p-$1"
}

# Where each role works. The spike is throwaway, so it gets its own worktree
# on spike/<idea>, branched from the idea branch; it is never merged.
role_worktree() {
  if [ "$2" = spiker ]; then echo "$repo_root/.claude/worktrees/$1-spike"; else echo "$repo_root/.claude/worktrees/$1"; fi
}
role_branch() {
  if [ "$2" = spiker ]; then echo "spike/$1"; else echo "feat/$1"; fi
}

# The report's key field: reviewers give a verdict, everyone else a status.
report_key() { [ "$1" = reviewer ] && echo verdict || echo status; }

# Each idea gets a port slot so its dev server, Vite and verification runs
# never collide with main's (8080/5173/18080/18173) or another idea's.
port_slot() {
  local name="$1" file="$orch_dir/ports.tsv" slot
  mkdir -p "$orch_dir"
  touch "$file"
  slot="$(awk -v n="$name" '$1 == n { print $2 }' "$file")"
  if [ -z "$slot" ]; then
    slot="$(awk 'BEGIN { m = 0 } $2 > m { m = $2 } END { print m + 1 }' "$file")"
    printf '%s\t%s\n' "$name" "$slot" >>"$file"
  fi
  echo "$slot"
}

# port_env <idea> [role]. The spike's ports are 5 above the idea's, so the
# spike and the real build can run side by side.
port_env() {
  local slot off=0
  slot="$(port_slot "$1")"
  [ "${2:-}" = spiker ] && off=5
  echo "PORT=$((8080 + slot * 10 + off))"
  echo "CLIENT_PORT=$((5173 + slot * 10 + off))"
  echo "API_URL=http://localhost:$((8080 + slot * 10 + off))"
  echo "VERIFY_SERVER_PORT=$((18080 + slot * 10 + off))"
  echo "VERIFY_CLIENT_PORT=$((18173 + slot * 10 + off))"
}

# Next round number for a role: builder-1, builder-2 (a fix round), ...
# spiker-2 is a re-spike after the owner's /taste.
next_round() {
  local dir="$orch_dir/$1/reports" n=1
  while [ -e "$dir/$2-$n.token" ]; do n=$((n + 1)); done
  echo "$n"
}

last_round() {
  local n
  n="$(next_round "$1" "$2")"
  echo $((n - 1))
}

agent_status() {
  herdr agent get "$1" 2>/dev/null | jq -r '.result.agent.agent_status // "gone"' 2>/dev/null || echo gone
}

# The report's first line must carry this round's token, so a late report
# from an earlier round is never read as this one's.
report_fresh() {
  local report="$1" token="$2"
  [ -s "$report" ] && [ "$(head -1 "$report")" = "token: $token" ]
}

header_field() {
  awk -v k="$2" 'NR > 1 && $0 ~ "^" k ":" { sub("^" k ":[ ]*", ""); print; exit }' "$1"
}
