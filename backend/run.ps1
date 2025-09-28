# PowerShell script to run MOBIUS FastAPI backend

$ErrorActionPreference = "Stop"

Write-Host "Starting MOBIUS FastAPI backend..." -ForegroundColor Green

# Default values
if (-not $env:PORT) { $env:PORT = "8000" }
if (-not $env:ALLOWED_TOKEN) { $env:ALLOWED_TOKEN = "dev_token_here" }

# Check if virtual environment exists
if (-not (Test-Path ".venv")) {
    Write-Host "Creating virtual environment..." -ForegroundColor Yellow
    python -m venv .venv
}

# Activate virtual environment
Write-Host "Activating virtual environment..." -ForegroundColor Yellow
& ".venv\Scripts\Activate.ps1"

# Install/update dependencies
Write-Host "Installing dependencies..." -ForegroundColor Yellow
pip install -r requirements.txt

Write-Host "Starting server on port $env:PORT..." -ForegroundColor Green
Write-Host "Using token: $env:ALLOWED_TOKEN" -ForegroundColor Yellow
Write-Host "Access health check at: http://localhost:$env:PORT/health" -ForegroundColor Cyan
Write-Host "Access docs at: http://localhost:$env:PORT/docs" -ForegroundColor Cyan

# Start the server
uvicorn main:app --host 0.0.0.0 --port $env:PORT --reload