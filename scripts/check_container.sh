#!/usr/bin/env bash
set -euo pipefail
JSON="${1:-artifacts/preview_ffprobe.json}"

# jq recommended; if not available, skip strict checks
if ! command -v jq >/dev/null 2>&1; then
  echo "jq not found; skipping container checks"
  exit 0
fi

pix_fmt=$(jq -r '.streams[] | select(.codec_type=="video") | .pix_fmt' "$JSON")
avg_rate=$(jq -r '.streams[] | select(.codec_type=="video") | .avg_frame_rate' "$JSON")
sar=$(jq -r '.streams[] | select(.codec_type=="video") | .sample_aspect_ratio' "$JSON")

fail=0
[ "$pix_fmt" = "yuv420p" ] || { echo "pix_fmt != yuv420p ($pix_fmt)"; fail=1; }
[ "$avg_rate" = "30/1" ] || { echo "avg_frame_rate != 30/1 ($avg_rate)"; fail=1; }
[ "$sar" = "1:1" ] || { echo "sample_aspect_ratio != 1:1 ($sar)"; fail=1; }

exit $fail