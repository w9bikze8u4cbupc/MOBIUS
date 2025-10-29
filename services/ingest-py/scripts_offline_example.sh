#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ ! -f "${SCRIPT_DIR}/pip_offline.sh" ]]; then
  echo "pip_offline.sh missing; ensure offline wheel cache is prepared." >&2
  exit 1
fi

echo "[offline] Installing ingest service dependencies from local wheel cache"
"${SCRIPT_DIR}/pip_offline.sh"

echo "[offline] Launching FastAPI ingest service"
uvicorn app.main:app --host 0.0.0.0 --port "${INGEST_PORT:-8001}" --reload
