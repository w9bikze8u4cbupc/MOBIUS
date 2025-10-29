#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}" >/dev/null

echo "[offline] Restoring node_modules from local archive"
"${SCRIPT_DIR}/node_unpack.sh"

echo "[offline] Starting API Gateway"
PORT="${PORT:-5001}" INGEST_SERVICE_URL="${INGEST_SERVICE_URL:-http://127.0.0.1:8001}" node src/index.js
