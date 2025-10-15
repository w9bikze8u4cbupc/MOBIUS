#!/bin/bash
# Script to validate preview payloads

echo "=== Preview Payload Validation ==="

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed or not in PATH"
    exit 1
fi

# Check if validation script exists
if [ ! -f "./scripts/validatePreviewPayload.js" ]; then
    echo "Error: Validation script not found at ./scripts/validatePreviewPayload.js"
    exit 1
fi

# Validate minimal payload
echo "Validating minimal payload..."
if [ -f "./preview_payload_minimal.json" ]; then
    node ./scripts/validatePreviewPayload.js ./preview_payload_minimal.json
else
    echo "Warning: Minimal payload file not found"
fi

echo ""

# Validate full payload
echo "Validating full payload..."
if [ -f "./preview_payload_full.json" ]; then
    node ./scripts/validatePreviewPayload.js ./preview_payload_full.json
else
    echo "Warning: Full payload file not found"
fi

echo ""
echo "=== Validation Complete ==="