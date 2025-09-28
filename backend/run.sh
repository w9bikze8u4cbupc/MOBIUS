#!/bin/bash
# Run script for MOBIUS FastAPI backend (Linux/macOS/Git Bash)

set -e

echo "🚀 Starting MOBIUS FastAPI Backend..."

# Check if we're in the backend directory
if [ ! -f "main.py" ]; then
    echo "❌ Error: Please run this script from the backend directory"
    echo "   cd backend && ./run.sh"
    exit 1
fi

# Check if virtual environment exists
if [ ! -d ".venv" ]; then
    echo "📦 Creating Python virtual environment..."
    python -m venv .venv
fi

# Activate virtual environment
echo "🔧 Activating virtual environment..."
source .venv/bin/activate

# Install/upgrade dependencies
echo "📦 Installing dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

# Set default environment variables if not already set
export ALLOWED_TOKEN=${ALLOWED_TOKEN:-"dev-token-123"}
export PYTHONPATH=${PYTHONPATH:-$(pwd)}

echo "🌍 Environment:"
echo "   ALLOWED_TOKEN: ${ALLOWED_TOKEN}"
echo "   PYTHONPATH: ${PYTHONPATH}"

# Run the FastAPI server
echo "🔥 Starting FastAPI server on http://localhost:8000"
echo "   API docs available at: http://localhost:8000/docs"
echo "   Health check: http://localhost:8000/health"
echo ""
echo "   Press Ctrl+C to stop the server"
echo ""

uvicorn main:app --reload --host 0.0.0.0 --port 8000