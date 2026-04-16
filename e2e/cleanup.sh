#!/usr/bin/env bash
#
# e2e/cleanup.sh — kill lingering processes from a failed e2e run
#
# The e2e harness spawns framework dev/prod servers as detached process
# groups from the examples/ directory. If Playwright crashes or is
# SIGKILL'd, the dispose() teardown never runs, leaving orphaned servers
# and stale lock files behind. This script cleans up both.
#
# Detection strategy: find any process whose working directory is under
# the repo's examples/ tree. This is more reliable than scanning a port
# range, since framework CLIs may listen on any port (hardcoded,
# ephemeral, or from a previous PORT_MIN/MAX range).
#
# Usage:
#   ./e2e/cleanup.sh          # interactive — shows what it will kill
#   ./e2e/cleanup.sh --force  # non-interactive — kills immediately

set -euo pipefail

LOCK_DIR="${TMPDIR:-/tmp}/vf-e2e-ports"
FORCE=false

if [[ "${1:-}" == "--force" ]]; then
  FORCE=true
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EXAMPLES_DIR="$REPO_ROOT/examples"

# ── 1. Find processes with cwd under examples/ ──────────────────────
#
# lsof -d cwd lists every process's working directory. We filter for
# entries whose path starts with our examples/ dir. This catches node,
# sh, vite, next, nuxt, tsx — anything the harness spawned.

found_pids=()
found_info=()

while IFS= read -r line; do
  # lsof output: COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME
  pid=$(echo "$line" | awk '{print $2}')
  cmd=$(echo "$line" | awk '{print $1}')
  cwd=$(echo "$line" | awk '{for(i=9;i<=NF;i++) printf "%s ", $i; print ""}' | sed 's/ *$//')

  # Skip header
  [[ "$pid" == "PID" ]] && continue

  # Only processes rooted in our examples dir
  [[ "$cwd" == "$EXAMPLES_DIR"* ]] || continue

  # Skip ourselves
  [[ "$pid" == "$$" ]] && continue

  # Deduplicate
  already=false
  for p in "${found_pids[@]+"${found_pids[@]}"}"; do
    [[ "$p" == "$pid" ]] && { already=true; break; }
  done
  $already && continue

  # Grab the port this process listens on (if any) for display purposes
  port=$(lsof -p "$pid" -iTCP -sTCP:LISTEN -n -P 2>/dev/null \
    | awk 'NR>1{print $NF}' | head -1 || true)

  found_pids+=("$pid")
  found_info+=("$(printf "%-8s %-20s %-24s %s" "$pid" "$cmd" "${port:-—}" "$cwd")")
done < <(lsof -d cwd +D "$EXAMPLES_DIR" 2>/dev/null || true)

# ── 2. Report and kill ───────────────────────────────────────────────

if [[ ${#found_pids[@]} -eq 0 ]]; then
  echo "No lingering e2e processes found."
else
  echo "Found ${#found_pids[@]} process(es) running from examples/:"
  echo ""
  printf "  %-8s %-20s %-24s %s\n" "PID" "COMMAND" "LISTEN" "CWD"
  for info in "${found_info[@]}"; do
    echo "  $info"
  done
  echo ""

  if $FORCE; then
    echo "Killing (--force)..."
  else
    read -rp "Kill all? [y/N] " confirm
    if [[ "$confirm" != [yY]* ]]; then
      echo "Aborted."
      exit 0
    fi
  fi

  for pid in "${found_pids[@]}"; do
    # Try to kill the whole process group first (mirrors killTree in server.ts).
    # The e2e harness spawns with detached:true, making the child a group leader,
    # so -$pgid targets the framework CLI and all its descendants.
    pgid=$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' ' || true)
    if [[ -n "$pgid" && "$pgid" != "0" ]]; then
      kill -TERM -- "-$pgid" 2>/dev/null || true
    else
      kill -TERM "$pid" 2>/dev/null || true
    fi
  done

  # Grace period, then SIGKILL stragglers
  sleep 2
  for pid in "${found_pids[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      echo "  Force-killing PID $pid..."
      kill -9 "$pid" 2>/dev/null || true
    fi
  done

  echo "Done."
fi

# ── 3. Clean up stale port lock files ────────────────────────────────

if [[ -d "$LOCK_DIR" ]]; then
  stale=0
  for marker in "$LOCK_DIR"/*; do
    [[ -f "$marker" ]] || continue
    stale=$((stale + 1))
    rm -f "$marker"
  done
  if [[ $stale -gt 0 ]]; then
    echo "Removed $stale stale port lock file(s) from $LOCK_DIR."
  fi
fi

# ── 4. Clean up Next.js dev lock files ───────────────────────────────

next_cleaned=0
for dir in "$REPO_ROOT"/examples/next*; do
  [[ -d "$dir/.next/dev" ]] || continue
  rm -rf "$dir/.next/dev"
  next_cleaned=$((next_cleaned + 1))
done
if [[ $next_cleaned -gt 0 ]]; then
  echo "Removed .next/dev lock dirs from $next_cleaned Next.js example(s)."
fi
