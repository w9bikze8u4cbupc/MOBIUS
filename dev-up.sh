#!/bin/bash

# dev-up.sh - Quick startup script for Mobius Games Tutorial Generator
# Usage: ./dev-up.sh

set -Eeuo pipefail  # Updated to match dev-down.sh

# =========================
# Config — edit as needed
# =========================
SCRIPT_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

LOG_DIR="${LOG_DIR:-logs}"
BACKEND_LOG="$LOG_DIR/dev-backend.log"
FRONTEND_LOG="$LOG_DIR/dev-frontend.log"
BACKEND_PID_FILE="$LOG_DIR/dev-backend.pid"
FRONTEND_PID_FILE="$LOG_DIR/dev-frontend.pid"
API_BASE="http://127.0.0.1:5001"  # Added API base for smoke test
# =========================

# Environment assertion
[ "${API_BASE:-}" = "http://127.0.0.1:5001" ] || echo "Note: API_BASE is '$API_BASE' (expected http://127.0.0.1:5001 in dev)"

# Double-start guard
already_running=false
for f in "$BACKEND_PID_FILE" "$FRONTEND_PID_FILE"; do
  if [ -f "$f" ]; then
    pid="$(cat "$f" 2>/dev/null || true)"
    if [ -n "${pid:-}" ] && kill -0 "$pid" 2>/dev/null; then
      echo "Process already running (PID $pid from $f). Run ./dev-down.sh first or use dev-restart."
      already_running=true
    fi
  fi
done
$already_running && exit 1

# Function to rotate logs
rotate_logs() {
  mkdir -p "$LOG_DIR"
  ts="$(date '+%Y%m%d-%H%M%S')"
  [ -f "$BACKEND_LOG" ] && mv "$BACKEND_LOG" "${BACKEND_LOG%.log}-$ts.log"
  [ -f "$FRONTEND_LOG" ] && mv "$FRONTEND_LOG" "${FRONTEND_LOG%.log}-$ts.log"
}

# Function to kill processes on specific ports
killport() {
    for p in "$@"; do
        lsof -ti tcp:$p | xargs -r kill -9 2>/dev/null || true
    done
}

# Parse arguments
SMOKE=false
for arg in "$@"; do
  [ "$arg" = "--smoke" ] && SMOKE=true
done

# Trap cleanup on failure
cleanup() {
  rm -f "$BACKEND_PID_FILE" "$FRONTEND_PID_FILE" 2>/dev/null || true
}
trap cleanup EXIT

# Colored logging
if command -v tput >/dev/null 2>&1 && [ -t 1 ]; then
  green=$(tput setaf 2); red=$(tput setaf 1); reset=$(tput sgr0)
else
  green=""; red=""; reset=""
fi
log() { printf '%s[%s]%s %s\n' "$green" "$(date '+%H:%M:%S')" "$reset" "$*"; }

echo "🚀 Mobius Games Tutorial Generator - Dev Startup"

echo "🧹 Cleaning up ports 3000 and 5001..."
killport 3000 5001

echo "⏱  Waiting for ports to be free..."
sleep 2

# Rotate logs before launching processes
rotate_logs

echo "🟢 Starting backend server..."

# Start backend and capture PID
npm run server > "$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!

# Write PID to file
echo $BACKEND_PID > "$BACKEND_PID_FILE"

# Wait a moment for backend to start
sleep 3

echo "🔍 Checking backend health..."
if curl -fsS "http://127.0.0.1:5001/healthz" >/dev/null 2>&1; then
    echo "✅ Backend is healthy (PID: $BACKEND_PID)"
else
    echo "❌ Backend health check failed. Last 80 lines:"
    tail -n 80 "$BACKEND_LOG" || true
    exit 1
fi

# Optional smoke test
if $SMOKE; then
  echo "🧪 Running smoke test against /start-extraction…"
  node -e "fetch('$API_BASE/start-extraction',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({bggUrl:'https://boardgamegeek.com/boardgame/155987/abyss'})}).then(r=>r.text()).then(t=>console.log('Smoke test result:', t)).catch(e=>console.error('Smoke test failed:', e))"
fi

echo "🎨 Starting frontend..."
cd client

# Start frontend and capture PID
npm start > "$FRONTEND_LOG" 2>&1 &
FRONTEND_PID=$!

# Write PID to file
echo $FRONTEND_PID > "$FRONTEND_PID_FILE"

echo "📋 Startup complete!"
echo "   Backend PID:  $BACKEND_PID (log: $BACKEND_LOG)"
echo "   Frontend PID: $FRONTEND_PID (log: $FRONTEND_LOG)"
echo ""
echo "🔗 Access the application at: http://localhost:3000"
echo "⚠️  Remember to disable Brave Shields for localhost:3000"
echo "🛑 To stop: ./dev-down.sh"
echo "📜 Logs are stored in: $LOG_DIR"