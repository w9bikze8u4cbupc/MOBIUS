#!/usr/bin/env bash
set -euo pipefail
# premerge_orchestration.sh - runs pre-merge gates: backup, dry-run deploy, migration dry-run, smoke tests, artifact collection
# Usage: ./premerge_orchestration.sh --env staging --output premerge_artifacts/ [--skip-backup]

ENV="staging"
OUTPUT_DIR="premerge_artifacts"
SKIP_BACKUP=0

while [[ ${#} -gt 0 ]]; do
  case "$1" in
    --env) ENV="$2"; shift 2;;
    --output) OUTPUT_DIR="$2"; shift 2;;
    --skip-backup) SKIP_BACKUP=1; shift;;
    --help) echo "Usage: premerge_orchestration.sh --env <env> --output <dir>"; exit 0;;
    *) echo "Unknown arg: $1"; exit 1;;
  esac
done

mkdir -p "${OUTPUT_DIR}"
echo "Pre-merge orchestration for env=${ENV}, artifacts -> ${OUTPUT_DIR}"

if [[ "${SKIP_BACKUP}" -ne 1 ]]; then
  ./scripts/deploy/backup.sh --env "${ENV}" --output "${OUTPUT_DIR}" || {
    echo "Backup failed"; exit 1;
  }
else
  echo "Skipping backup as requested"
fi

echo "Running deploy dry-run..."
./scripts/deploy/deploy_dryrun.sh --env "${ENV}" --output "${OUTPUT_DIR}/deploy-dryrun.log"

echo "Running migration dry-run..."
./scripts/deploy/migration_dryrun.sh --env "${ENV}" --output "${OUTPUT_DIR}/migration-dryrun.log"

echo "Running smoke tests..."
./scripts/deploy/smoke_tests.sh --env "${ENV}" --output "${OUTPUT_DIR}/smoke-tests.log"

echo "Collecting artifacts..."
# Example: copy logs/artifacts into output dir
# cp -r logs/ "${OUTPUT_DIR}/" || true

echo "Pre-merge orchestration complete. Artifacts in ${OUTPUT_DIR}"
