#!/usr/bin/env bash
set -euo pipefail
# backup.sh - create timestamped ZIP backups (keeps last 10) and produce SHA256 checksum
# Usage: ./backup.sh --env production --components all [--output backups/]

ENV="production"
COMPONENTS="all"
OUTPUT_DIR="backups"
KEEP=10
DRY_RUN=0

print_help() {
  cat <<EOF
backup.sh --env <env> --components <all|app|config> [--output <dir>] [--keep <n>] [--dry-run]
EOF
}

while [[ ${#} -gt 0 ]]; do
  case "$1" in
    --env) ENV="$2"; shift 2;;
    --components) COMPONENTS="$2"; shift 2;;
    --output) OUTPUT_DIR="$2"; shift 2;;
    --keep) KEEP="$2"; shift 2;;
    --dry-run) DRY_RUN=1; shift;;
    --help) print_help; exit 0;;
    *) echo "Unknown arg: $1"; exit 1;;
  esac
done

TIMESTAMP=$(date -u +"%Y%m%dT%H%M%SZ")
FILE_NAME="dhash_${ENV}_${TIMESTAMP}.zip"
mkdir -p "${OUTPUT_DIR}"
echo "Creating backup: ${OUTPUT_DIR}/${FILE_NAME}"

if [[ "${DRY_RUN}" -eq 1 ]]; then
  echo "[DRY-RUN] Would collect: src/ client/ package.json scripts/ runbooks/ tests/golden/"
  echo "[DRY-RUN] Would create zip: ${OUTPUT_DIR}/${FILE_NAME}"
  exit 0
fi

# List of things to include - adjust to your repo
zip -r "${OUTPUT_DIR}/${FILE_NAME}" src/ client/ package.json scripts/ runbooks/ tests/golden/ >/dev/null 2>&1 || {
  echo "Warning: some paths may be missing; ensure repository layout."
}

# Generate checksum
sha256sum "${OUTPUT_DIR}/${FILE_NAME}" > "${OUTPUT_DIR}/${FILE_NAME}.sha256"

# Cleanup old backups (keep last $KEEP)
ls -1t "${OUTPUT_DIR}"/dhash_${ENV}_*.zip 2>/dev/null | tail -n +$((KEEP+1)) | xargs -r rm -f

echo "Backup created: ${OUTPUT_DIR}/${FILE_NAME}"
echo "Checksum: ${OUTPUT_DIR}/${FILE_NAME}.sha256"
