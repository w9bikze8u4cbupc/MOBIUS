#!/usr/bin/env bash
set -euo pipefail

ARTIFACTS_DIR="${1:-artifacts}"
PREVIEW_PATH="${2:-out/preview_with_audio.mp4}"
mkdir -p "$ARTIFACTS_DIR"

# FFmpeg provenance
ffmpeg -version            | tee  "$ARTIFACTS_DIR/ffmpeg_version.txt" >/dev/null
ffmpeg -buildconf          | tee  "$ARTIFACTS_DIR/ffmpeg_buildconf.txt" >/dev/null
ffmpeg -filters            | tee  "$ARTIFACTS_DIR/ffmpeg_filters.txt" >/dev/null || true

# ffprobe: streams + format
if [ -f "$PREVIEW_PATH" ]; then
  ffprobe -v quiet -of json -show_streams "$PREVIEW_PATH" \
    > "$ARTIFACTS_DIR/preview_ffprobe.json" || true
  ffprobe -v quiet -of json -show_format "$PREVIEW_PATH" \
    > "$ARTIFACTS_DIR/preview_ffprobe_format.json" || true
fi

# System + toolchain provenance
{
  echo "{"
  echo "  \"timestamp\": \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\","
  echo "  \"git\": {"
  echo "    \"commit\": \"$(git rev-parse --short HEAD 2>/dev/null || echo unknown)\","
  echo "    \"branch\": \"$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)\""
  echo "  },"
  echo "  \"node\": {"
  echo "    \"nodeVersion\": \"$(node -v 2>/dev/null || echo unknown)\","
  echo "    \"npmVersion\": \"$(npm -v 2>/dev/null || echo unknown)\""
  echo "  },"
  echo "  \"typescript\": {"
  echo "    \"tscVersion\": \"$(npx tsc -v 2>/dev/null || echo unknown)\""
  echo "  },"
  echo "  \"os\": {"
  echo "    \"uname\": \"$(uname -a 2>/dev/null || echo unknown)\""
  echo "  }"
  echo "}"
} > "$ARTIFACTS_DIR/repro_manifest.json"

echo "Provenance captured to $ARTIFACTS_DIR"