#!/bin/bash

# Test script for the /api/ingest endpoint

echo "Testing /api/ingest endpoint..."

# Start the server in the background
echo "Starting server..."
node src/api/index.js &
SERVER_PID=$!

# Give the server time to start
sleep 3

# Test 1: Minimal ingest
echo "Test 1: Minimal ingest"
curl -F "file=@data/fixtures/test-fixture.txt" http://localhost:5001/api/ingest

echo ""

# Test 2: Ingest with BGG ID
echo "Test 2: Ingest with BGG ID"
curl -F "file=@data/fixtures/test-fixture.txt" -F "bggId=302723" http://localhost:5001/api/ingest

echo ""

# Test 3: Ingest with BGG URL
echo "Test 3: Ingest with BGG URL"
curl -F "file=@data/fixtures/test-fixture.txt" -F "bggUrl=https://boardgamegeek.com/boardgame/302723" http://localhost:5001/api/ingest

echo ""

# Test 4: Ingest with title
echo "Test 4: Ingest with title"
curl -F "file=@data/fixtures/test-fixture.txt" -F "title=Jaipur" http://localhost:5001/api/ingest

echo ""

# Test 5: Dry run
echo "Test 5: Dry run"
curl -F "file=@data/fixtures/test-fixture.txt" -F "dryRun=true" http://localhost:5001/api/ingest

echo ""

# Stop the server
echo "Stopping server..."
kill $SERVER_PID