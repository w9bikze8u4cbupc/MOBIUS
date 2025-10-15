#!/bin/bash

# Preview Worker Verification Script (Unix/Linux/macOS)
# This script verifies that the Preview Worker is properly implemented and functional

set -e

echo "=== Preview Worker Verification ==="

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "Error: Must run from project root directory"
    exit 1
fi

echo "✓ Running from project root"

# Check dependencies
echo "Checking dependencies..."
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo "Error: npm is not installed"
    exit 1
fi

echo "✓ Node.js and npm are installed"

# Check if Redis is running
echo "Checking Redis connectivity..."
if nc -z localhost 6379; then
    echo "✓ Redis is running on localhost:6379"
else
    echo "Warning: Redis is not running on localhost:6379"
    echo "  Please start Redis server before running full tests"
fi

# Install dependencies
echo "Installing dependencies..."
npm ci

# Run payload validation tests
echo "Running payload validation tests..."
npm run test:preview-payloads

# Run unit tests
echo "Running unit tests..."
npm test

# Check for required files
echo "Checking for required files..."

required_files=(
    "src/worker/previewWorker.js"
    "src/worker/previewWorkerClient.js"
    "src/worker/previewMetrics.js"
    "src/worker/health.js"
    "src/worker/jobHandlers/renderPreview.js"
    "schemas/preview-job.schema.json"
    "scripts/validatePreviewPayload.js"
    "tests/worker/previewWorker.comprehensive.test.js"
    ".github/workflows/ci-preview-worker.yml"
)

for file in "${required_files[@]}"; do
    if [ -f "$file" ]; then
        echo "✓ $file exists"
    else
        echo "✗ $file is missing"
        exit 1
    fi
done

# Check package.json for new scripts
echo "Checking package.json for new scripts..."
if grep -q "worker:preview" package.json; then
    echo "✓ worker:preview script exists"
else
    echo "✗ worker:preview script is missing"
    exit 1
fi

if grep -q "test:preview-payloads" package.json; then
    echo "✓ test:preview-payloads script exists"
else
    echo "✗ test:preview-payloads script is missing"
    exit 1
fi

# Check package.json for new dependencies
echo "Checking package.json for new dependencies..."
if grep -q "bullmq" package.json; then
    echo "✓ bullmq dependency exists"
else
    echo "✗ bullmq dependency is missing"
    exit 1
fi

if grep -q "ioredis" package.json; then
    echo "✓ ioredis dependency exists"
else
    echo "✗ ioredis dependency is missing"
    exit 1
fi

echo ""
echo "=== Preview Worker Verification Complete ==="
echo "All checks passed! The Preview Worker implementation is ready."
echo ""
echo "Next steps:"
echo "1. Start Redis server if not already running"
echo "2. Start the worker: npm run worker:preview"
echo "3. Test the API endpoints:"
echo "   - Health check: curl http://localhost:5001/api/preview/worker/health"
echo "   - Submit job: curl -X POST http://localhost:5001/api/preview/job -H 'Content-Type: application/json' -d @preview_payload_minimal.json"