#!/bin/bash

# MOBIUS Full Verification Script
# This script runs a complete verification of the MOBIUS system

echo "================================"
echo "MOBIUS Full System Verification"
echo "================================"

# Function to kill processes on specific ports
kill_port_processes() {
  local ports=("$@")
  
  for port in "${ports[@]}"; do
    echo "Checking port $port..."
    if command -v lsof >/dev/null 2>&1; then
      pids=$(lsof -ti :"$port" 2>/dev/null || true)
      if [[ -n "$pids" ]]; then
        echo "  Killing processes on port $port: $pids"
        kill -9 $pids 2>/dev/null || true
      else
        echo "  No processes found on port $port"
      fi
    else
      echo "  lsof not available; cannot check port $port"
    fi
  done
}

# Kill any existing processes on our ports
echo ""
echo "1. Cleaning up existing processes..."
kill_port_processes 5001 3000

# Wait a moment for processes to fully terminate
sleep 2

# Run the verification
echo ""
echo "2. Running MOBIUS verification..."
if npm run mobius:verify:unix; then
  echo ""
  echo "✅ Verification completed successfully!"
  echo "================================"
  exit 0
else
  exit_code=$?
  echo ""
  echo "❌ Verification failed with exit code $exit_code"
  echo "================================"
  exit $exit_code
fi