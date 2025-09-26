#!/usr/bin/env bash
set -euo pipefail
# lcm_export.sh - export lifecycle management artifacts (json/yaml)
OUT_DIR="lcm_export"
FORMAT="json"
while [[ ${#} -gt 0 ]]; do
  case "$1" in
    --out) OUT_DIR="$2"; shift 2;;
    --format) FORMAT="$2"; shift 2;;
    --help) echo "Usage: lcm_export.sh --out <dir> --format json|yaml"; exit 0;;
    *) echo "Unknown arg: $1"; exit 1;;
  esac
done
mkdir -p "${OUT_DIR}"
TS=$(date -u +"%Y%m%dT%H%M%SZ")
FILE="${OUT_DIR}/lcm_export_${TS}.${FORMAT}"
echo "{" > "${FILE}"
echo "  \"exported_at\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"," >> "${FILE}"
echo "  \"backups\": []" >> "${FILE}"
echo "}" >> "${FILE}"
echo "LCM export written to ${FILE}"
