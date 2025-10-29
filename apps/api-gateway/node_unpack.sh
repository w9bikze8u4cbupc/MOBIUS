#!/usr/bin/env bash
set -euo pipefail
ARCHIVE="${1:-offline/node_modules.tgz}"
TARGET_DIR="node_modules"
if [[ ! -f "${ARCHIVE}" ]]; then
  echo "offline node_modules archive not found: ${ARCHIVE}" >&2
  exit 1
fi
mkdir -p "${TARGET_DIR}"
tar -xzf "${ARCHIVE}" -C "${TARGET_DIR}" --strip-components=1
