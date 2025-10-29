#!/usr/bin/env bash
set -euo pipefail

ARCHIVE_PATH=${1:-"node_modules.tgz"}
TARGET_DIR=${2:-"node_modules"}

if [[ ! -f "$ARCHIVE_PATH" ]]; then
  echo "Archive $ARCHIVE_PATH not found" >&2
  exit 1
fi

echo "Extracting $ARCHIVE_PATH to $TARGET_DIR"
rm -rf "$TARGET_DIR"
mkdir -p "$TARGET_DIR"
tar -xzf "$ARCHIVE_PATH" -C "$TARGET_DIR" --strip-components=1
