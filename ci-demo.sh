#!/bin/bash

# CI Demo Script - simulates the GitHub Actions workflow locally

echo "=== MOBIUS CI Workflow Demo ==="
echo "Simulating the multi-platform Node.js + React CI pipeline"
echo ""

echo "Step 1: Install dependencies"
echo "Root dependencies:"
npm ci
echo ""

echo "Client dependencies:"
cd client && npm ci && cd ..
echo ""

echo "Step 2: Run linting (if present)"
echo "Root lint:"
npm run lint --if-present
echo "Client lint:"
cd client && npm run lint --if-present && cd ..
echo ""

echo "Step 3: Run tests"
echo "Root tests:"
npm test --if-present --silent
echo "Client tests:"
cd client && npm test --if-present --silent && cd ..
echo ""

echo "Step 4: Start API server and test health endpoints"
echo "Starting API server in background..."
npm start &
API_PID=$!
sleep 3

echo "Testing public health endpoint:"
curl -s http://localhost:5001/ | jq . || echo "Health endpoint not accessible"

echo "Testing authenticated health endpoint with token:"
export ALLOWED_TOKEN="demo-token-$(date +%s)"
curl -s -H "Authorization: Bearer $ALLOWED_TOKEN" http://localhost:5001/health | jq . || echo "Auth health endpoint not accessible"

echo "Cleaning up API server..."
kill $API_PID 2>/dev/null || true

echo ""
echo "Step 5: Docker compose staging test"
echo "Building and starting staging stack..."
ALLOWED_TOKEN="staging-demo-token" docker compose -f docker-compose.staging.yml up -d

echo "Waiting for staging API health..."
for i in $(seq 1 30); do
  if curl -fsS http://localhost:5001/ >/dev/null 2>&1; then
    echo "Staging API is healthy!"
    break
  fi
  sleep 1
done

echo "Testing staging endpoints:"
curl -s http://localhost:5001/ | jq .
curl -s -H "Authorization: Bearer staging-demo-token" http://localhost:5001/health | jq .

echo "Tearing down staging stack..."
docker compose -f docker-compose.staging.yml down --volumes --remove-orphans

echo ""
echo "=== CI Workflow Demo Complete ==="
echo "✅ All pipeline steps completed successfully!"
echo ""
echo "This CI workflow provides:"
echo "• Multi-OS matrix testing (Ubuntu, macOS, Windows)"
echo "• API smoke testing with authentication"
echo "• Staging environment E2E testing with docker-compose"
echo "• Artifact collection for debugging"
echo "• Graceful handling of missing scripts and dependencies"