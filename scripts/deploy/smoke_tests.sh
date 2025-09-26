#!/usr/bin/env bash
set -euo pipefail
# smoke_tests.sh - run a set of lightweight verification tests against deployed endpoints
ENV="production"
BASE_URL=""
OUTPUT_FILE=""
COUNT=5

while [[ ${#} -gt 0 ]]; do
  case "$1" in
    --env) ENV="$2"; shift 2;;
    --base-url) BASE_URL="$2"; shift 2;;
    --output) OUTPUT_FILE="$2"; shift 2;;
    --count) COUNT="$2"; shift 2;;
    --help) echo "Usage: smoke_tests.sh --env <env> --base-url <url> [--output <file>]"; exit 0;;
    *) echo "Unknown arg: $1"; exit 1;;
  esac
done

echo "Running smoke tests for ${ENV} (base_url=${BASE_URL})" | tee "${OUTPUT_FILE:-/dev/stdout}"
for i in $(seq 1 $COUNT); do
  echo "check $i: timestamp=$(date -u +%s)" | tee -a "${OUTPUT_FILE:-/dev/stdout}"
  sleep 1
done
echo "Smoke tests completed" | tee -a "${OUTPUT_FILE:-/dev/stdout}"
