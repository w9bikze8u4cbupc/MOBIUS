#!/usr/bin/env bash
set -Eeuo pipefail

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
PORTS_DEFAULT=("3000" "5001")
CLEAN_LOGS="${CLEAN_LOGS:-false}"   # set to true to remove logs
# =========================

log() { printf '[%s] %s\n' "$(date '+%H:%M:%S')" "$*"; }

get_pids_by_port() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -ti tcp:"$port" || true
  elif command -v fuser >/dev/null 2>&1; then
    # fuser prints PIDs to stdout
    fuser "$port"/tcp 2>/dev/null || true
  else
    echo ""
  fi
}

kill_pids() {
  local signal="$1"; shift
  local pids=("$@")
  [ "${#pids[@]}" -eq 0 ] && return 0
  if [ "$signal" = "KILL" ]; then
    kill -9 "${pids[@]}" 2>/dev/null || true
  else
    kill -TERM "${pids[@]}" 2>/dev/null || true
  fi
}

kill_by_port() {
  local signal="$1" ; shift
  for p in "$@"; do
    local pids=()
    mapfile -t pids < <(get_pids_by_port "$p")
    [ "${#pids[@]}" -gt 0 ] && kill_pids "$signal" "${pids[@]}"
  done
}

kill_pid_files() {
  for f in "$BACKEND_PID_FILE" "$FRONTEND_PID_FILE"; do
    if [ -f "$f" ]; then
      local pid
      pid="$(cat "$f" 2>/dev/null || true)"
      if [ -n "${pid:-}" ]; then
        kill -TERM "$pid" 2>/dev/null || true
      fi
    fi
  done
}

ports_free() {
  for p in "$@"; do
    if [ -n "$(get_pids_by_port "$p")" ]; then
      return 1
    fi
  done
  return 0
}

parse_args() {
  PORTS=("${PORTS_DEFAULT[@]}")
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --clean-logs) CLEAN_LOGS=true; shift ;;
      --ports) shift; IFS=',' read -r -a PORTS <<< "${1:-}"; shift ;;
      *) echo "Unknown arg: $1"; exit 1 ;;
    esac
  done
}

main() {
  parse_args "$@"

  log "Shutting down Mobius Games Tutorial Generator…"

  # Try PID files first (if dev-up created them)
  kill_pid_files || true

  # Graceful terminate on ports
  log "Terminating ports ${PORTS[*]} (SIGTERM)…"
  kill_by_port "TERM" "${PORTS[@]}"

  # Wait a bit
  sleep 2

  # Force kill if still present
  if ! ports_free "${PORTS[@]}"; then
    log "Force killing remaining processes on ports ${PORTS[*]} (SIGKILL)…"
    kill_by_port "KILL" "${PORTS[@]}"
  fi

  # Verify ports are free
  for i in $(seq 1 20); do
    if ports_free "${PORTS[@]}"; then
      log "All target ports are free."
      break
    fi
    sleep 0.3
    if [ "$i" -eq 20 ]; then
      log "Warning: Some ports still appear in use. Check with: lsof -i :${PORTS[0]}"
    fi
  done

  # Optional log cleanup
  if [ "$CLEAN_LOGS" = "true" ]; then
    log "Cleaning up log and PID files…"
    rm -f "$BACKEND_LOG" "$FRONTEND_LOG" "$BACKEND_PID_FILE" "$FRONTEND_PID_FILE" 2>/dev/null || true
  else
    log "Keeping logs in $LOG_DIR (use --clean-logs to remove)."
    rm -f "$BACKEND_PID_FILE" "$FRONTEND_PID_FILE" 2>/dev/null || true
  fi

  log "Dev down complete."
}

main "$@"