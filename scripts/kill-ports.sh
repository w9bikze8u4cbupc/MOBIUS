#!/usr/bin/env bash
set -euo pipefail
if [[ $# -eq 0 ]]; then
  echo "Usage: $0 port [port...]" >&2
  exit 2
fi
for port in "$@"; do
  if command -v lsof >/dev/null 2>&1; then
    pids=$(lsof -ti :"$port" || true)
    if [[ -n "$pids" ]]; then
      echo "Killing $pids on port $port"
      kill -9 $pids || true
    else
      echo "No process on port $port"
    fi
  else
    echo "lsof not available; cannot kill port $port" >&2
  fi
done