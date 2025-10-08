#!/bin/bash

# verify-phase-e.sh
# Cross-platform verification script for Phase E implementation

set -e

echo "========================================="
echo "Phase E Verification Script"
echo "========================================="

# Check if required tools are available
echo "Checking prerequisites..."
if ! command -v curl &> /dev/null; then
    echo "ERROR: curl is required but not found"
    exit 1
fi

if ! command -v node &> /dev/null; then
    echo "ERROR: node is required but not found"
    exit 1
fi

echo "✓ All prerequisites found"

# Set environment variables
export DATA_DIR="./data"
export PORT="5001"

echo "Using DATA_DIR: $DATA_DIR"
echo "Using PORT: $PORT"

# Create data directory if it doesn't exist
mkdir -p "$DATA_DIR"

# Run migration script
echo "Running migration script..."
npm run migrate:data

# Start server in background
echo "Starting server..."
node src/api/index.js &
SERVER_PID=$!

# Give server time to start
sleep 3

# Verify server is running
echo "Verifying server health..."
HEALTH_RESPONSE=$(curl -s http://localhost:$PORT/health)
if [[ $HEALTH_RESPONSE == *"\"status\":\"ok\""* ]]; then
    echo "✓ Health endpoint responding correctly"
    echo "Health response: $HEALTH_RESPONSE"
else
    echo "✗ Health endpoint not responding correctly"
    echo "Health response: $HEALTH_RESPONSE"
    kill $SERVER_PID
    exit 1
fi

# Verify metrics endpoint
echo "Verifying metrics endpoint..."
METRICS_RESPONSE=$(curl -s http://localhost:$PORT/metrics)
if [[ $METRICS_RESPONSE == *"\"counters\""* ]]; then
    echo "✓ Metrics endpoint responding correctly"
    echo "Metrics response: $METRICS_RESPONSE"
else
    echo "✗ Metrics endpoint not responding correctly"
    echo "Metrics response: $METRICS_RESPONSE"
    kill $SERVER_PID
    exit 1
fi

# Test file upload (create a test file first)
echo "Testing file upload..."
echo "This is a test file for Phase E verification" > test-upload.txt
UPLOAD_RESPONSE=$(curl -s -F "file=@test-upload.txt" http://localhost:$PORT/api/ingest)
if [[ $UPLOAD_RESPONSE == *"\"ok\":true"* ]]; then
    echo "✓ File upload successful"
    echo "Upload response: $UPLOAD_RESPONSE"
else
    echo "✗ File upload failed"
    echo "Upload response: $UPLOAD_RESPONSE"
    rm -f test-upload.txt
    kill $SERVER_PID
    exit 1
fi

# Clean up test file
rm -f test-upload.txt

# Check if file was stored in correct location
echo "Verifying file storage location..."
if ls $DATA_DIR/uploads/* 1> /dev/null 2>&1; then
    echo "✓ Files stored in correct DATA_DIR location"
    echo "Files in $DATA_DIR/uploads/:"
    ls -la $DATA_DIR/uploads/
else
    echo "✗ Files not found in DATA_DIR/uploads/"
    kill $SERVER_PID
    exit 1
fi

# Stop server
echo "Stopping server..."
kill $SERVER_PID

echo "========================================="
echo "Phase E Verification Complete - All tests passed!"
echo "========================================="