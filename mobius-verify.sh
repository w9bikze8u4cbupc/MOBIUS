#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_DIR="$ROOT_DIR/client"
BACKEND_PORT=5001
FRONTEND_PORT=3000
SMOKE_CMD="npm run test:smoke"   # adjust to your smoke test command

pids=()

function kill_on_port() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    pids_to_kill=$(lsof -ti :"$port" || true)
    if [[ -n "$pids_to_kill" ]]; then
      echo "Killing processes on port $port: $pids_to_kill"
      kill -9 $pids_to_kill || true
    fi
  else
    echo "lsof not found; skipping port kill for $port (ensure no process is listening)"
  fi
}

function wait_for_http() {
  local url="$1"
  local timeout="${2:-60}"
  echo "Waiting up to ${timeout}s for ${url} ..."
  local start=$(date +%s)
  while true; do
    if curl -sS --max-time 3 "$url" >/dev/null 2>&1; then
      echo "${url} is up"
      return 0
    fi
    now=$(date +%s)
    if (( now - start >= timeout )); then
      echo "Timed out waiting for ${url}"
      return 1
    fi
    sleep 1
  done
}

function cleanup() {
  echo "Cleaning up..."
  for pid in "${pids[@]}"; do
    if kill -0 "$pid" >/dev/null 2>&1; then
      echo "Killing PID $pid"
      kill "$pid" || true
    fi
  done
}
trap cleanup EXIT

# Ensure no conflicting processes
kill_on_port $BACKEND_PORT
kill_on_port $FRONTEND_PORT

# Start backend
echo "Starting backend..."
( cd "$ROOT_DIR" && npm run server ) >/tmp/mobius-backend.log 2>&1 &
backend_pid=$!
pids+=($backend_pid)
echo "Backend PID: $backend_pid (logs -> /tmp/mobius-backend.log)"

# Start frontend
echo "Starting frontend..."
( cd "$FRONTEND_DIR" && npm start ) >/tmp/mobius-frontend.log 2>&1 &
frontend_pid=$!
pids+=($frontend_pid)
echo "Frontend PID: $frontend_pid (logs -> /tmp/mobius-frontend.log)"

# Wait for services
wait_for_http "http://localhost:${BACKEND_PORT}/healthz" 60
wait_for_http "http://localhost:${FRONTEND_PORT}" 60

# Run smoke tests
echo "Running smoke tests: ${SMOKE_CMD}"
( cd "$ROOT_DIR" && eval "$SMOKE_CMD" )
smoke_exit=$?

if [[ $smoke_exit -ne 0 ]]; then
  echo "Smoke tests failed (exit $smoke_exit). See logs:"
  echo "Backend log: /tmp/mobius-backend.log"
  echo "Frontend log: /tmp/mobius-frontend.log"
  exit $smoke_exit
fi

echo "Smoke tests passed ✅"
exit 0