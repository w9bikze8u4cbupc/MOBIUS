#!/bin/bash

set -e

echo "Starting MOBIUS FastAPI backend..."

# Default values
PORT=${PORT:-8000}
ALLOWED_TOKEN=${ALLOWED_TOKEN:-dev_token_here}

# Check if virtual environment exists
if [ ! -d ".venv" ]; then
    echo "Creating virtual environment..."
    python -m venv .venv
fi

# Activate virtual environment
echo "Activating virtual environment..."
source .venv/bin/activate

# Install/update dependencies
echo "Installing dependencies..."
pip install -r requirements.txt

# Set environment variables
export PORT=$PORT
export ALLOWED_TOKEN=$ALLOWED_TOKEN

echo "Starting server on port $PORT..."
echo "Using token: $ALLOWED_TOKEN"
echo "Access health check at: http://localhost:$PORT/health"
echo "Access docs at: http://localhost:$PORT/docs"

# Start the server
uvicorn main:app --host 0.0.0.0 --port $PORT --reload