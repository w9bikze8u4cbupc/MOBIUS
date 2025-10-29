#!/usr/bin/env bash
set -euo pipefail

REQ_FILE=${1:-"requirements.txt"}
WHEEL_ARCHIVE=${2:-"wheelhouse.tgz"}
VENV_DIR=${3:-".venv"}

if [[ ! -f "$REQ_FILE" ]]; then
  echo "Requirements file $REQ_FILE not found" >&2
  exit 1
fi

if [[ ! -f "$WHEEL_ARCHIVE" ]]; then
  echo "Wheel archive $WHEEL_ARCHIVE not found" >&2
  exit 1
fi

python -m venv "$VENV_DIR"
# shellcheck disable=SC1090
source "$VENV_DIR/bin/activate"

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

tar -xzf "$WHEEL_ARCHIVE" -C "$TMP_DIR"
pip install --no-index --find-links="$TMP_DIR" -r "$REQ_FILE"
