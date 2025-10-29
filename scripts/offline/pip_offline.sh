#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 3 ]]; then
  echo "Usage: $0 <requirements.txt> <wheel-archive.tgz> <venv-dir>" >&2
  exit 1
fi

REQUIREMENTS="$1"
WHEEL_ARCHIVE="$2"
VENV_DIR="$3"

if [[ ! -f "$REQUIREMENTS" ]]; then
  echo "Requirements file '$REQUIREMENTS' not found." >&2
  exit 1
fi

if [[ ! -f "$WHEEL_ARCHIVE" ]]; then
  echo "Wheel archive '$WHEEL_ARCHIVE' not found." >&2
  exit 1
fi

python3 -m venv "$VENV_DIR"
source "$VENV_DIR/bin/activate"

TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

tar -xzf "$WHEEL_ARCHIVE" -C "$TEMP_DIR"
WHEEL_DIR="$TEMP_DIR"
if [[ -d "$TEMP_DIR/wheelhouse" ]]; then
  WHEEL_DIR="$TEMP_DIR/wheelhouse"
fi

pip install --no-index --find-links "$WHEEL_DIR" -r "$REQUIREMENTS"

echo "Virtual environment ready at '$VENV_DIR'"
