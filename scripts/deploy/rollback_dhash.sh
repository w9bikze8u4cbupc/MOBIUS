#!/usr/bin/env bash
set -euo pipefail
# rollback_dhash.sh - restore from a verified backup and run post-restore verification
BACKUP=""
ENV="production"
FORCE=0

while [[ ${#} -gt 0 ]]; do
  case "$1" in
    --backup) BACKUP="$2"; shift 2;;
    --env) ENV="$2"; shift 2;;
    --force) FORCE=1; shift;;
    --help) echo "Usage: rollback_dhash.sh --backup <path> --env <env> [--force]"; exit 0;;
    *) echo "Unknown arg: $1"; exit 1;;
  esac
done

if [[ -z "${BACKUP}" ]]; then
  echo "ERROR: --backup required"; exit 1;
fi

if [[ ! -f "${BACKUP}" ]]; then
  echo "ERROR: backup file not found: ${BACKUP}"; exit 1;
fi

echo "Verifying checksum for ${BACKUP}"
if ! sha256sum -c "${BACKUP}.sha256"; then
  echo "Checksum verification failed"
  if [[ "${FORCE}" -ne 1 ]]; then
    echo "Abort rollback. Use --force to bypass (not recommended)."
    exit 2
  fi
fi

echo "Extracting backup..."
unzip -o "${BACKUP}" -d /tmp/dhash_restore >/dev/null 2>&1
# TODO: Insert project-specific restore steps (db restore, service restart)
echo "Restoration completed to /tmp/dhash_restore (custom restore steps required)"

echo "Running post-restore health checks..."
./scripts/deploy/smoke_tests.sh --env "${ENV}"

echo "Rollback complete"
