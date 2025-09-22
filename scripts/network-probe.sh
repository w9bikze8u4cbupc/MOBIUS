#!/usr/bin/env bash
# scripts/network-probe.sh
# Quick connectivity tests for required external endpoints.
# Produces colorized output and writes full logs to /tmp/network-probe-<timestamp>.log
# Exit code: 0 if all probes succeed, non-zero if one or more fail.

set -euo pipefail
IFS=$'\n\t'

TIMESTAMP=$(date +"%Y%m%dT%H%M%S")
LOG="/tmp/network-probe-${TIMESTAMP}.log"
HOSTS=(
  "api.openai.com"
  "api.elevenlabs.io"
)
# Optional: allow extra hosts via env var
if [ -n "${EXTRA_NETWORK_HOSTS:-}" ]; then
  read -r -a EXTRA <<< "$EXTRA_NETWORK_HOSTS"
  HOSTS+=("${EXTRA[@]}")
fi

# Color helpers
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "Network probe started at $(date)" | tee "$LOG"
FAILURES=0

which_cmd() {
  command -v "$1" >/dev/null 2>&1
}

probe_host() {
  local host="$1"
  echo -e "${BLUE}== Probing ${host} ==${NC}" | tee -a "$LOG"

  # DNS resolution (dig preferred, fallback to nslookup)
  echo "--- DNS resolution" | tee -a "$LOG"
  if which_cmd dig; then
    echo "dig +short ${host} (system resolver):" | tee -a "$LOG"
    dig +short "$host" | tee -a "$LOG" || true
  elif which_cmd nslookup; then
    echo "nslookup ${host}:" | tee -a "$LOG"
    nslookup "$host" | tee -a "$LOG" || true
  else
    echo "dig/nslookup not available" | tee -a "$LOG"
  fi

  # DNS resolution against public resolvers
  echo "--- DNS via public resolvers" | tee -a "$LOG"
  for RES in "1.1.1.1" "8.8.8.8"; do
    if which_cmd dig; then
      echo "dig +short @$RES $host:" | tee -a "$LOG"
      dig +short @"$RES" "$host" | tee -a "$LOG" || true
    fi
  done

  # TCP connect (curl) to HTTPS root or known path for health check
  echo "--- HTTPS connectivity (curl)" | tee -a "$LOG"
  if which_cmd curl; then
    # Choose a probe path for known hosts (keeps generic)
    local path="/"
    if [[ "$host" == "api.openai.com" ]]; then path="/v1/models"; fi
    if [[ "$host" == "api.elevenlabs.io" ]]; then path="/v1"; fi

    if curl -sS --max-time 10 -I "https://${host}${path}" >/dev/null 2>&1; then
      echo -e "${GREEN}HTTPS connection to ${host} succeeded${NC}" | tee -a "$LOG"
    else
      echo -e "${YELLOW}HTTPS connection to ${host} failed or timed out${NC}" | tee -a "$LOG"
      FAILURES=$((FAILURES+1))
    fi
  else
    echo "curl not available; skipping HTTPS probe" | tee -a "$LOG"
  fi

  # traceroute (optional, may need sudo on some systems)
  echo "--- traceroute (first 10 hops)" | tee -a "$LOG"
  if which_cmd traceroute; then
    traceroute -m 10 "$host" 2>&1 | tee -a "$LOG" || true
  elif which_cmd tracepath; then
    tracepath "$host" 2>&1 | tee -a "$LOG" || true
  else
    echo "traceroute/tracepath not available; skipping" | tee -a "$LOG"
  fi

  echo -e "${BLUE}== End probe ${host} ==${NC}" | tee -a "$LOG"
  echo "" | tee -a "$LOG"
}

for H in "${HOSTS[@]}"; do
  probe_host "$H"
done

echo "Probe finished at $(date)" | tee -a "$LOG"
echo "Full probe log: $LOG"

if [ "$FAILURES" -gt 0 ]; then
  echo -e "${YELLOW}One or more probes failed (${FAILURES}). Check the log above: $LOG${NC}"
  # Return non-zero so CI or caller can detect failures; CI step can be continue-on-error
  exit 2
else
  echo -e "${GREEN}All probes succeeded${NC}"
  exit 0
fi