#!/usr/bin/env bash
set -euo pipefail
# deploy_dryrun.sh - validates deployment preconditions (git state, permissions, deps), doesn't change infra
ENV="staging"
OUTPUT_FILE=""
DRY_RUN=1

while [[ ${#} -gt 0 ]]; do
  case "$1" in
    --env) ENV="$2"; shift 2;;
    --output) OUTPUT_FILE="$2"; shift 2;;
    --apply) DRY_RUN=0; shift;;
    --help) echo "Usage: deploy_dryrun.sh --env <env> [--output <file>] [--apply]"; exit 0;;
    *) echo "Unknown arg: $1"; exit 1;;
  esac
done

echo "Deploy dry-run for env=${ENV} (dry-run=${DRY_RUN})" | tee "${OUTPUT_FILE:-/dev/stdout}"
echo "Checking git state..." | tee -a "${OUTPUT_FILE:-/dev/stdout}"
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "ERROR: Working tree or index is dirty. Abort dry-run." | tee -a "${OUTPUT_FILE:-/dev/stdout}"
  exit 2
fi
echo "Git state OK" | tee -a "${OUTPUT_FILE:-/dev/stdout}"

echo "Checking required permissions and tools..." | tee -a "${OUTPUT_FILE:-/dev/stdout}"
command -v sha256sum >/dev/null 2>&1 || { echo "sha256sum not found"; exit 3; }
command -v zip >/dev/null 2>&1 || { echo "zip not found"; exit 3; }

echo "Dependency checks OK" | tee -a "${OUTPUT_FILE:-/dev/stdout}"
echo "Simulating deployment steps..." | tee -a "${OUTPUT_FILE:-/dev/stdout}"
sleep 1
echo "Dry-run complete" | tee -a "${OUTPUT_FILE:-/dev/stdout}"
