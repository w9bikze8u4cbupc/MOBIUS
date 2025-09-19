# dev-up.ps1 - Quick startup script for Mobius Games Tutorial Generator
# Usage: .\dev-up.ps1

param([switch]$Smoke)

# =========================
# Config — edit as needed
# =========================
Set-Location $PSScriptRoot

# Use if-else instead of null-coalescing operator for compatibility
if ($env:LOG_DIR) {
    $LogDir = $env:LOG_DIR
} else {
    $LogDir = 'logs'
}

$BackendLog   = Join-Path $LogDir 'dev-backend.log'
$FrontendLog  = Join-Path $LogDir 'dev-frontend.log'
$BackendPid   = Join-Path $LogDir 'dev-backend.pid'
$FrontendPid  = Join-Path $LogDir 'dev-frontend.pid'
$ApiBase      = "http://127.0.0.1:5001"  # Added API base for smoke test
# =========================

# Environment assertion
if ($ApiBase -ne 'http://127.0.0.1:5001') { 
    Write-Host "Note: ApiBase is '$ApiBase' (expected http://127.0.0.1:5001 in dev)" -ForegroundColor Yellow
}

# Double-start guard
$alreadyRunning = $false
foreach ($f in @($BackendPid, $FrontendPid)) {
  if (Test-Path $f) {
    try {
      $pid = [int](Get-Content $f -Raw)
      if (Get-Process -Id $pid -ErrorAction SilentlyContinue) {
        Write-Host "Process already running (PID $pid from $f). Run dev-down.ps1 or use dev-restart.ps1."
        $alreadyRunning = $true
      }
    } catch {}
  }
}
if ($alreadyRunning) { exit 1 }

# Create logs directory if it doesn't exist and rotate logs
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$ts = Get-Date -Format 'yyyyMMdd-HHmmss'
if (Test-Path $BackendLog) { Move-Item -Path $BackendLog -Destination ($BackendLog -replace '\.log$', "-$ts.log") -Force }
if (Test-Path $FrontendLog) { Move-Item -Path $FrontendLog -Destination ($FrontendLog -replace '\.log$', "-$ts.log") -Force }

Write-Host "Mobius Games Tutorial Generator - Dev Startup" -ForegroundColor Green

# Function to kill processes on specific ports
function Stop-Port {
    param([int[]]$Ports)
    foreach ($port in $Ports) {
        $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
        foreach ($connection in $connections) {
            try {
                Stop-Process -Id $connection.OwningProcess -Force -ErrorAction SilentlyContinue
                Write-Host "Killed process on port $port" -ForegroundColor Green
            } catch {
                Write-Host "Could not kill process on port $port" -ForegroundColor Yellow
            }
        }
    }
}

Write-Host "Cleaning up ports 3000 and 5001..." -ForegroundColor Cyan
Stop-Port 3000, 5001

Write-Host "Waiting for ports to be free..." -ForegroundColor Cyan
Start-Sleep -Seconds 2

# Set security protocol for reliable connections
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$PSDefaultParameterValues['ConvertTo-Json:Depth'] = 5

Write-Host "Starting backend server..." -ForegroundColor Cyan

# Start backend and capture process info
$backend = Start-Process -NoNewWindow -FilePath "node" -ArgumentList "start-server.js" -PassThru -RedirectStandardOutput $BackendLog

# Write PID to file
Set-Content -Path $BackendPid -Value $backend.Id

# Wait a moment for backend to start
Start-Sleep -Seconds 3

Write-Host "Checking backend health..." -ForegroundColor Cyan
try {
    $healthResponse = Invoke-WebRequest -Uri "http://127.0.0.1:5001/healthz" -UseBasicParsing -TimeoutSec 10
    if ($healthResponse.StatusCode -eq 200 -and $healthResponse.Content -eq "ok") {
        Write-Host "Backend is healthy (PID: $($backend.Id))" -ForegroundColor Green
    } else {
        Write-Host "Backend health check failed. Last 80 lines:" -ForegroundColor Red
        if (Test-Path $BackendLog) { 
            $lines = Get-Content -Path $BackendLog -Tail 80
            $lines | Write-Host
        }
        if ($backend.Id) {
            Stop-Process -Id $backend.Id -Force -ErrorAction SilentlyContinue
        }
        exit 1
    }
} catch {
    Write-Host "Backend health check failed. Last 80 lines:" -ForegroundColor Red
    if (Test-Path $BackendLog) { 
        $lines = Get-Content -Path $BackendLog -Tail 80
        $lines | Write-Host
    }
    if ($backend.Id) {
        Stop-Process -Id $backend.Id -Force -ErrorAction SilentlyContinue
    }
    exit 1
}

# Optional smoke test
if ($PSBoundParameters.ContainsKey('Smoke') -and $Smoke) {
  Write-Host "Running smoke test against /start-extraction..." -ForegroundColor Cyan
  $body = @{ bggUrl = 'https://boardgamegeek.com/boardgame/155987/abyss' } | ConvertTo-Json
  try {
    $resp = Invoke-RestMethod -Uri "$ApiBase/start-extraction" -Method Post -Body $body -ContentType 'application/json'
    Write-Host "Smoke test result: $($resp | ConvertTo-Json -Depth 5)" -ForegroundColor Green
  } catch {
    Write-Host "Smoke test failed: $($_.Exception.Message)" -ForegroundColor Red
  }
}

Write-Host "Starting frontend..." -ForegroundColor Cyan
Set-Location -Path "$PSScriptRoot\client"

# Start frontend and capture process info
try {
    $frontend = Start-Process -NoNewWindow -FilePath "npm" -ArgumentList "start" -PassThru -RedirectStandardOutput $FrontendLog
    # Write PID to file
    Set-Content -Path $FrontendPid -Value $frontend.Id
} catch {
    Write-Host "Warning: Could not start frontend. Please run 'cd client && npm start' manually." -ForegroundColor Yellow
    $frontend = $null
}

Write-Host "Startup complete!" -ForegroundColor Green
Write-Host "   Backend PID:  $($backend.Id) (log: $BackendLog)"
if ($frontend) {
    Write-Host "   Frontend PID: $($frontend.Id) (log: $FrontendLog)"
} else {
    Write-Host "   Frontend PID: Not started (log: $FrontendLog)"
}
Write-Host ""
Write-Host "Access the application at: http://localhost:3000" -ForegroundColor Yellow
Write-Host "Remember to disable Brave Shields for localhost:3000" -ForegroundColor Yellow
Write-Host "To stop: .\dev-down.ps1" -ForegroundColor Yellow
Write-Host "Logs are stored in: $LogDir" -ForegroundColor Yellow