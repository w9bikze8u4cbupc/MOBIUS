#!/bin/bash

GAME=${1:-space-invaders}
OS=${2:-macos}

DEBUG_DIR="tests/golden/$GAME/$OS/debug"
BASELINE_DIR="tests/golden/$GAME/$OS"

if [ -d "$DEBUG_DIR" ]; then
    for f in "$DEBUG_DIR"/actual_*; do
        if [ -f "$f" ]; then
            b=$(basename "$f")
            cp -f "$f" "$BASELINE_DIR/${b#actual_}"
            echo "Promoted $b to $BASELINE_DIR/${b#actual_}"
        fi
    done
    echo "Baseline promotion complete for $GAME on $OS"
else
    echo "Debug directory not found: $DEBUG_DIR"
fi