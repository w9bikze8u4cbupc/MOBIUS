#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WHEEL_DIR="${SCRIPT_DIR}/offline/wheels"
REQ_FILE="${SCRIPT_DIR}/requirements.txt"

if [[ ! -d "${WHEEL_DIR}" ]]; then
  echo "[pip_offline] wheel cache not found at ${WHEEL_DIR}" >&2
  exit 1
fi

python -m pip install --no-index --find-links "${WHEEL_DIR}" -r "${REQ_FILE}"
