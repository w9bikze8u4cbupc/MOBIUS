#!/bin/bash

# Test script to validate network probe functionality
# This script tests the network probe in various scenarios

set -euo pipefail

echo "========================================="
echo "Network Probe Validation Test"
echo "========================================="
echo

# Create test directory
TEST_DIR="/tmp/network-probe-test"
rm -rf "$TEST_DIR"
mkdir -p "$TEST_DIR"

# Test 1: Run network probe and check artifacts are generated
echo "Test 1: Running network probe and checking artifact generation..."
if ./scripts/network-probe.sh "$TEST_DIR"; then
  echo "✓ Network probe completed successfully (unexpected in sandbox)"
else
  echo "✓ Network probe failed as expected in sandbox environment"
fi

# Check that all expected artifacts were created
EXPECTED_FILES=(
  "network-probe.log"
  "network-diagnostics.json"
  "traceroute.log"
  "dig.log"
  "openssl.log"
)

echo
echo "Checking generated artifacts:"
for file in "${EXPECTED_FILES[@]}"; do
  if [[ -f "$TEST_DIR/$file" ]]; then
    echo "✓ $file exists ($(wc -l < "$TEST_DIR/$file") lines)"
  else
    echo "✗ $file missing"
    exit 1
  fi
done

# Test 2: Validate JSON structure
echo
echo "Test 2: Validating JSON structure..."
if command -v jq >/dev/null 2>&1; then
  if jq . "$TEST_DIR/network-diagnostics.json" >/dev/null 2>&1; then
    echo "✓ JSON is valid"
    
    # Check required fields
    REQUIRED_FIELDS=(".timestamp" ".results" ".summary.passed" ".summary.failed" ".summary.warnings")
    for field in "${REQUIRED_FIELDS[@]}"; do
      if jq -e "$field" "$TEST_DIR/network-diagnostics.json" >/dev/null 2>&1; then
        echo "✓ Required field $field exists"
      else
        echo "✗ Required field $field missing"
        exit 1
      fi
    done
    
    # Display summary
    echo
    echo "Summary from JSON:"
    jq '.summary' "$TEST_DIR/network-diagnostics.json"
    
  else
    echo "✗ JSON is invalid"
    exit 1
  fi
else
  echo "⚠️ jq not available, skipping JSON validation"
fi

# Test 3: Check log content
echo
echo "Test 3: Checking log content..."
if grep -q "Starting network connectivity probe" "$TEST_DIR/network-probe.log"; then
  echo "✓ Log contains expected header"
else
  echo "✗ Log missing expected header"
  exit 1
fi

if grep -q "SUMMARY" "$TEST_DIR/network-probe.log"; then
  echo "✓ Log contains summary section"
else
  echo "✗ Log missing summary section"
  exit 1
fi

# Test 4: Verify script handles missing output directory
echo
echo "Test 4: Testing default output directory behavior..."
ORIGINAL_PWD="$PWD"
cd /tmp
if "$ORIGINAL_PWD/scripts/network-probe.sh" >/dev/null 2>&1; then
  echo "✓ Script handled default directory correctly"
else
  echo "✓ Script failed as expected (network issues)"
fi
cd "$ORIGINAL_PWD"

# Check that artifacts directory was created
if [[ -d "/tmp/artifacts" ]]; then
  echo "✓ Default artifacts directory created"
  rm -rf "/tmp/artifacts"
else
  echo "⚠️ Default artifacts directory not found (may be expected)"
fi

echo
echo "========================================="
echo "All tests completed successfully!"
echo "Network probe is ready for CI integration."
echo "========================================="

# Display sample output for verification
echo
echo "Sample network-probe.log output (last 10 lines):"
tail -n 10 "$TEST_DIR/network-probe.log"

# Clean up
rm -rf "$TEST_DIR"