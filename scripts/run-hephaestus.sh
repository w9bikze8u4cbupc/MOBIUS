#!/bin/bash
# scripts/run-hephaestus.sh
# Cross-platform launcher for HEPHAESTUS external workspace
# Handles Unix-specific path resolution

set -e

# Parse arguments
PDF_PATH=""
OUTPUT_DIR=""
MIN_CONFIDENCE="0.7"
WORKSPACE="${HEPHAESTUS_WORKSPACE:-}"
CLI="${HEPHAESTUS_CLI:-}"
PYTHON="${HEPHAESTUS_PYTHON:-python3}"

while [[ $# -gt 0 ]]; do
    case $1 in
        --pdf)
            PDF_PATH="$2"
            shift 2
            ;;
        --output)
            OUTPUT_DIR="$2"
            shift 2
            ;;
        --min-confidence)
            MIN_CONFIDENCE="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Validate inputs
if [ -z "$PDF_PATH" ] || [ -z "$OUTPUT_DIR" ]; then
    echo "Usage: $0 --pdf <path> --output <dir> [--min-confidence <value>]"
    exit 1
fi

if [ ! -f "$PDF_PATH" ]; then
    echo "Error: PDF not found: $PDF_PATH"
    exit 1
fi

mkdir -p "$OUTPUT_DIR"

# Resolve HEPHAESTUS execution method
if [ -n "$CLI" ] && [ -f "$CLI" ]; then
    # Explicit CLI path
    echo "Using explicit HEPHAESTUS CLI: $CLI"
    "$CLI" extract --mode mobius "$PDF_PATH" --out "$OUTPUT_DIR" --min-confidence "$MIN_CONFIDENCE"
    EXIT_CODE=$?
elif [ -n "$WORKSPACE" ] && [ -d "$WORKSPACE" ]; then
    # Python module mode
    echo "Using HEPHAESTUS workspace: $WORKSPACE"
    cd "$WORKSPACE"
    "$PYTHON" -m hephaestus extract --mode mobius "$PDF_PATH" --out "$OUTPUT_DIR" --min-confidence "$MIN_CONFIDENCE"
    EXIT_CODE=$?
else
    echo "Error: HEPHAESTUS not configured. Set HEPHAESTUS_WORKSPACE or HEPHAESTUS_CLI"
    exit 1
fi

# Validate MOBIUS_READY marker
READY_MARKER="$OUTPUT_DIR/MOBIUS_READY/manifest.json"
if [ ! -f "$READY_MARKER" ]; then
    echo "Error: MOBIUS_READY marker not found at: $READY_MARKER"
    exit 1
fi

echo "✅ HEPHAESTUS extraction complete"
echo "   MOBIUS_READY marker validated"
exit $EXIT_CODE
