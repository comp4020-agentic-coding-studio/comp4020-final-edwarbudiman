#!/usr/bin/env bash
# Show this week's COMP4020 strproxy spend. Never prints the token.
# Token: $ANTHROPIC_AUTH_TOKEN, else .claude/settings.local.json (env block).
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
# In a linked worktree, settings.local.json lives in the main checkout.
COMMON="$(git rev-parse --git-common-dir 2>/dev/null || true)"
MAIN_ROOT="${COMMON:+$(cd "$COMMON/.." && pwd)}"

load_from_settings() {
  local key="$1" f
  for f in "$ROOT/.claude/settings.local.json" "${MAIN_ROOT:-/nonexistent}/.claude/settings.local.json"; do
    if [ -f "$f" ]; then
      node -p "(require('$f').env||{})['$key']||''" 2>/dev/null && return 0
    fi
  done
  return 0
}

TOKEN="${ANTHROPIC_AUTH_TOKEN:-$(load_from_settings ANTHROPIC_AUTH_TOKEN)}"
if [ -z "$TOKEN" ]; then
  echo "ANTHROPIC_AUTH_TOKEN not set and not found in .claude/settings.local.json" >&2
  exit 1
fi

# Host: same as ANTHROPIC_BASE_URL if parseable, else the course default.
BASE="${ANTHROPIC_BASE_URL:-$(load_from_settings ANTHROPIC_BASE_URL)}"
HOST="$(printf '%s' "$BASE" | sed -nE 's#^(https?://[^/]+).*#\1#p')"
HOST="${HOST:-https://strproxy.comp.anu.edu.au}"

QUERY=""
[ "${1:-}" = "--detail" ] && QUERY="?detail=requests"

# Pass the header via stdin config so the token never appears in argv/ps.
RESP="$(printf 'header = "Authorization: Bearer %s"\n' "$TOKEN" \
  | curl -sf -K - "$HOST/api/me$QUERY")" || {
  echo "Request failed. Off-campus? Connect to the ANU VPN. A 401 means the key was rejected." >&2
  exit 1
}

if [ -n "$QUERY" ]; then
  printf '%s\n' "$RESP"
  exit 0
fi

printf '%s' "$RESP" | node -e '
const d = JSON.parse(require("fs").readFileSync(0, "utf8"));
const s = +d.current_week_spend, m = +d.max_budget;
const r = new Date(d.week_resets_at).toLocaleString("en-AU", {
  weekday: "long", day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
});
console.log(`Spent $${s.toFixed(2)} of $${m.toFixed(2)} this week (${(100 * s / m).toFixed(0)}%), resets ${r}`);
'
