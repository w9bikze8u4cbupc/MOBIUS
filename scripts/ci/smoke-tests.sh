#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://localhost:5001}"
TIMEOUT="${2:-15}"
RETRIES="${3:-2}"
LOG="smoke-tests.log"

: > "${LOG}"
echo "$(date -u +%FT%TZ) START smoke tests against ${BASE_URL}" | tee -a "${LOG}"

run_with_retries() {
  local desc=$1
  local method=${2:-GET}
  local path=$3
  local expect_code=${4:-200}
  local body=${5:-}

  local attempt=0
  while :; do
    attempt=$((attempt+1))
    echo "$(date -u +%FT%TZ) [attempt ${attempt}] ${desc}: ${method} ${BASE_URL}${path}" | tee -a "${LOG}"
    if [ "${method}" = "POST" ]; then
      curl -sSf -m "${TIMEOUT}" -H "Content-Type: application/json" -X POST -d "${body}" "${BASE_URL}${path}" -o /tmp/resp$$.json || true
      code=$?
      http_code=$(cat /tmp/resp$$.json >/dev/null 2>&1 && printf "0" || true)
      # fallback: check curl exit code vs expected via separate status query
      http_status=$(curl -s -o /dev/null -w "%{http_code}" -m "${TIMEOUT}" -X POST -H "Content-Type: application/json" -d "${body}" "${BASE_URL}${path}" || echo "000")
    else
      http_status=$(curl -s -o /tmp/resp$$.json -w "%{http_code}" -m "${TIMEOUT}" "${BASE_URL}${path}" || echo "000")
    fi

    if [ "${http_status}" = "${expect_code}" ] || [ "${http_status}" -eq "${expect_code}" ] 2>/dev/null; then
      echo "$(date -u +%FT%TZ) PASS ${desc} (${http_status})" | tee -a "${LOG}"
      return 0
    fi

    if [ "${attempt}" -gt "${RETRIES}" ]; then
      echo "$(date -u +%FT%TZ) FAIL ${desc} after ${attempt} attempts (last status: ${http_status})" | tee -a "${LOG}"
      return 1
    fi
    sleep 1
  done
}

run_with_retries "health endpoint" GET "/health" 200
run_with_retries "ready endpoint" GET "/ready" 200
run_with_retries "info endpoint" GET "/api/info" 200
run_with_retries "echo GET" GET "/api/echo/hello" 200
run_with_retries "echo POST" POST "/api/echo" 200 '{"test":"ok"}'

# 404 check (expect non-200)
echo "$(date -u +%FT%TZ) Checking 404 behavior" | tee -a "${LOG}"
if curl -s -f -m "${TIMEOUT}" "${BASE_URL}/does-not-exist" > /dev/null 2>&1; then
  echo "$(date -u +%FT%TZ) FAIL expected 404 for /does-not-exist" | tee -a "${LOG}"
  exit 1
else
  echo "$(date -u +%FT%TZ) PASS 404 behavior" | tee -a "${LOG}"
fi

echo "$(date -u +%FT%TZ) ALL smoke tests passed" | tee -a "${LOG}"
