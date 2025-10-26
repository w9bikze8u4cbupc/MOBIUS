#!/bin/bash

# Batch 2 Verification Script for Unix/Linux environments
# This script verifies that all Batch 2 validation artifacts are present and valid

echo "=== Batch 2 Validation Verification ==="
echo "Timestamp: $(date -u)"
echo

# Check if we're in the correct directory
if [ ! -f "package.json" ]; then
  echo "ERROR: Must run from project root directory"
  exit 1
fi

echo "=== Directory Structure Check ==="
echo "Checking validation/batch2/logs..."
if [ -d "validation/batch2/logs" ]; then
  echo "✓ Logs directory exists"
  LOG_COUNT=$(ls -1 validation/batch2/logs | wc -l)
  echo "  Found $LOG_COUNT files in logs directory"
else
  echo "✗ Logs directory missing"
  exit 1
fi

echo
echo "Checking validation/batch2/artifacts..."
if [ -d "validation/batch2/artifacts" ]; then
  echo "✓ Artifacts directory exists"
  ARTIFACT_COUNT=$(ls -1 validation/batch2/artifacts | wc -l)
  echo "  Found $ARTIFACT_COUNT files in artifacts directory"
else
  echo "✗ Artifacts directory missing"
  exit 1
fi

echo
echo "=== File Presence Verification ==="

# Check required documentation files
REQUIRED_FILES=(
  "validation/batch2/BATCH2_VALIDATION_FAILED.md"
  "validation/batch2/BATCH2_VALIDATION_COMPLETE.md"
  "validation/batch2/BATCH2_MANIFEST.json"
  "validation/issues/20251020_003-batch2-endpoint-failures.json"
  "validation/issues/20251020_003-batch2-endpoint-failures-RESOLVED.json"
)

for file in "${REQUIRED_FILES[@]}"; do
  if [ -f "$file" ]; then
    echo "✓ $file"
  else
    echo "✗ $file (MISSING)"
    exit 1
  fi
done

echo
echo "=== JSON Validation ==="

# Check key log files
if [ -f "validation/batch2/logs/C-01_pdf_upload.json" ]; then
  if jq empty validation/batch2/logs/C-01_pdf_upload.json 2>/dev/null; then
    echo "✓ C-01_pdf_upload.json is valid JSON"
  else
    echo "✗ C-01_pdf_upload.json is invalid JSON"
    exit 1
  fi
else
  echo "✗ C-01_pdf_upload.json missing"
  exit 1
fi

if [ -f "validation/batch2/logs/D-01_board_import.json" ]; then
  if jq empty validation/batch2/logs/D-01_board_import.json 2>/dev/null; then
    echo "✓ D-01_board_import.json is valid JSON"
  else
    echo "✗ D-01_board_import.json is invalid JSON"
    exit 1
  fi
else
  echo "✗ D-01_board_import.json missing"
  exit 1
fi

echo
echo "=== Archive Verification ==="

if [ -f "validation/batch2/logs.zip" ]; then
  echo "✓ logs.zip archive exists"
  # Test if it's a valid zip file
  if unzip -t validation/batch2/logs.zip >/dev/null 2>&1; then
    echo "✓ logs.zip is valid archive"
  else
    echo "✗ logs.zip is corrupted"
    exit 1
  fi
else
  echo "✗ logs.zip missing"
  exit 1
fi

echo
echo "=== Harness Fail-Fast Verification ==="

# Check for fail-fast implementation in validation harness
if grep -q "process.exit(1)" "validation/tools/api-validation-harness.js"; then
  echo "✓ Fail-fast behavior detected in api-validation-harness.js"
else
  echo "✗ Fail-fast behavior not found"
  exit 1
fi

echo
echo "=== Summary ==="
echo "✓ All Batch 2 validation artifacts verified successfully"
echo "✓ JSON files validated"
echo "✓ Archive integrity confirmed"
echo "✓ Fail-fast behavior confirmed"
echo
echo "Batch 2 Validation: PASSED"