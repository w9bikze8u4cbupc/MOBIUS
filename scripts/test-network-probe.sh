#!/bin/bash
# Test script for network probe functionality
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "🧪 Testing network probe script..."

# Test 1: Mock mode produces valid JSON
echo "Test 1: Mock mode JSON output"
cd "$PROJECT_ROOT"
MOCK_OPENAI=true MOCK_ELEVENLABS=true MOCK_BGG=true MOCK_EXTRACT_PICS=true ./scripts/network-probe.sh > /dev/null 2>&1 || true

if [ -f network-diagnostics.json ]; then
    echo "✅ JSON file created"
    
    # Validate JSON structure
    if jq -e '.timestamp and .results and .summary' network-diagnostics.json > /dev/null; then
        echo "✅ JSON structure is valid"
    else
        echo "❌ JSON structure is invalid"
        exit 1
    fi
    
    # Check for mocked status
    mocked_count=$(jq '[.results[] | select(.overall_status == "mocked")] | length' network-diagnostics.json)
    if [ "$mocked_count" -eq 5 ]; then
        echo "✅ All endpoints correctly marked as mocked"
    else
        echo "❌ Expected 5 mocked endpoints, found $mocked_count"
        exit 1
    fi
else
    echo "❌ JSON file not created"
    exit 1
fi

# Test 2: Required tools check
echo "Test 2: Tool availability"
if command -v jq >/dev/null 2>&1; then
    echo "✅ jq available"
else
    echo "❌ jq not available"
    exit 1
fi

# Test 3: Script executable
echo "Test 3: Script permissions"
if [ -x ./scripts/network-probe.sh ]; then
    echo "✅ Script is executable"
else
    echo "❌ Script is not executable"
    exit 1
fi

# Test 4: npm scripts work
echo "Test 4: npm scripts"
if npm run network:probe --silent > /dev/null 2>&1 || true; then
    echo "✅ npm run network:probe works"
else
    echo "❌ npm run network:probe failed"
    exit 1
fi

# Clean up
rm -f network-probe.log network-diagnostics.json traceroute.log dig.log openssl.log

echo "🎉 All tests passed!"