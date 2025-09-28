# Run script for MOBIUS FastAPI backend (Windows PowerShell)

Write-Host "🚀 Starting MOBIUS FastAPI Backend..." -ForegroundColor Green

# Check if we're in the backend directory
if (-not (Test-Path "main.py")) {
    Write-Host "❌ Error: Please run this script from the backend directory" -ForegroundColor Red
    Write-Host "   cd backend && .\run.ps1" -ForegroundColor Yellow
    exit 1
}

# Check if virtual environment exists
if (-not (Test-Path ".venv")) {
    Write-Host "📦 Creating Python virtual environment..." -ForegroundColor Yellow
    python -m venv .venv
}

# Activate virtual environment
Write-Host "🔧 Activating virtual environment..." -ForegroundColor Yellow
& .\.venv\Scripts\Activate.ps1

# Install/upgrade dependencies
Write-Host "📦 Installing dependencies..." -ForegroundColor Yellow
pip install --upgrade pip
pip install -r requirements.txt

# Set default environment variables if not already set
if (-not $env:ALLOWED_TOKEN) {
    $env:ALLOWED_TOKEN = "dev-token-123"
}
if (-not $env:PYTHONPATH) {
    $env:PYTHONPATH = (Get-Location).Path
}

Write-Host "🌍 Environment:" -ForegroundColor Cyan
Write-Host "   ALLOWED_TOKEN: $env:ALLOWED_TOKEN"
Write-Host "   PYTHONPATH: $env:PYTHONPATH"

# Run the FastAPI server
Write-Host "🔥 Starting FastAPI server on http://localhost:8000" -ForegroundColor Green
Write-Host "   API docs available at: http://localhost:8000/docs" -ForegroundColor Cyan
Write-Host "   Health check: http://localhost:8000/health" -ForegroundColor Cyan
Write-Host ""
Write-Host "   Press Ctrl+C to stop the server" -ForegroundColor Yellow
Write-Host ""

# Alternative: Use python main.py instead of uvicorn for Windows compatibility
# python main.py

uvicorn main:app --reload --host 0.0.0.0 --port 8000