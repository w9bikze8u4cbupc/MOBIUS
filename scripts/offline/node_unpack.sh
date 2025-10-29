#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <archive> [destination]" >&2
  exit 1
fi

ARCHIVE="$1"
DESTINATION="${2:-node_modules}"

if [[ ! -f "$ARCHIVE" ]]; then
  echo "Archive '$ARCHIVE' does not exist." >&2
  exit 1
fi

if [[ -d "$DESTINATION" ]]; then
  echo "Removing existing '$DESTINATION' directory" >&2
  rm -rf "$DESTINATION"
fi

tar -xzf "$ARCHIVE"

if [[ ! -d "$DESTINATION" ]]; then
  EXTRACTED_DIR=$(tar -tzf "$ARCHIVE" | head -1 | cut -d'/' -f1)
  if [[ -n "$EXTRACTED_DIR" && -d "$EXTRACTED_DIR" && "$EXTRACTED_DIR" != "$DESTINATION" ]]; then
    mv "$EXTRACTED_DIR" "$DESTINATION"
  fi
fi

echo "Node modules restored to '$DESTINATION'"
