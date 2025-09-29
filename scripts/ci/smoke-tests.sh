#!/usr/bin/env bash
set -euo pipefail

# Usage: ./scripts/ci/smoke-tests.sh <API_URL> <timeout_seconds> <retry_interval_seconds>
API_URL="${1:-http://localhost:5001}"
TIMEOUT="${2:-30}"
RETRY="${3:-2}"

START_TS=$(date +%s)
END_TS=$((START_TS + TIMEOUT))

LOGFILE="./scripts/ci/smoke-tests.log"
rm -f "$LOGFILE"
touch "$LOGFILE"

echo "Smoke test start: $(date -u)" | tee -a "$LOGFILE"
echo "API_URL=${API_URL}, TIMEOUT=${TIMEOUT}, RETRY=${RETRY}" | tee -a "$LOGFILE"

fail() { echo "SMOKE-TEST: FAIL - $*" | tee -a "$LOGFILE"; cat "$LOGFILE"; exit 1; }
ok()   { echo "SMOKE-TEST: OK - $*" | tee -a "$LOGFILE"; }

try_curl() {
  local url="$1"
  local out
  if out=$(curl -sS -f -H "Accept: application/json" -H "Content-Type: application/json" "$url" 2>&1); then
    echo "$out"
    return 0
  else
    echo "$out" >&2
    return 1
  fi
}

echo "Waiting for /health to become healthy..."
while [ "$(date +%s)" -lt "$END_TS" ]; do
  if resp=$(try_curl "${API_URL}/health"); then
    echo "/health response: $resp" | tee -a "$LOGFILE"
    if command -v jq >/dev/null 2>&1; then
      echo "$resp" | jq -e '.status == "healthy"' >/dev/null 2>&1 || fail "health.status != healthy"
      MODE=$(echo "$resp" | jq -r '.mode // "unknown"')
    else
      echo "$resp" | grep -q '"status"' || fail "no status in /health response"
      MODE=$(echo "$resp" | sed -n 's/.*"mode"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' || echo "unknown")
    fi
    echo "Mode detected: ${MODE}" | tee -a "$LOGFILE"
    ok "/health OK"
    break
  fi
  echo "Not yet healthy, sleeping ${RETRY}s..." | tee -a "$LOGFILE"
  sleep "$RETRY"
done

if [ "$(date +%s)" -ge "$END_TS" ]; then
  fail "/health did not become healthy within ${TIMEOUT}s"
fi

# /ready
echo "Checking /ready..."
if resp=$(try_curl "${API_URL}/ready"); then
  echo "/ready response: $resp" | tee -a "$LOGFILE"
  ok "/ready OK"
else
  fail "/ready failed"
fi

# /api/info
echo "Checking /api/info..."
if resp=$(try_curl "${API_URL}/api/info"); then
  echo "/api/info response: $resp" | tee -a "$LOGFILE"
  ok "/api/info OK"
else
  fail "/api/info failed"
fi

# POST /api/echo
echo "Checking POST /api/echo..."
PAYLOAD='{"test":"ping","ts":"'"$(date -u --iso-8601=seconds)"'"}'
if resp=$(curl -sS -f -H "Content-Type: application/json" -d "$PAYLOAD" "${API_URL}/api/echo"); then
  echo "/api/echo response: $resp" | tee -a "$LOGFILE"
  if echo "$resp" | grep -q '"test":"ping"'; then
    ok "/api/echo OK"
  else
    fail "/api/echo did not echo payload"
  fi
else
  fail "/api/echo failed"
fi

# Verify 404 handling
echo "Checking 404..."
resp_code=$(curl -sS -o /dev/null -w "%{http_code}" "${API_URL}/not-found") || true
if [ "$resp_code" -eq 404 ]; then
  ok "404 behavior OK"
else
  fail "expected 404, got ${resp_code}"
fi

echo "All smoke checks passed" | tee -a "$LOGFILE"
exit 0