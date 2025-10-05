# MOBIUS Full Verification Script
# This script runs a complete verification of the MOBIUS system

Write-Host "================================" -ForegroundColor Cyan
Write-Host "MOBIUS Full System Verification" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan

# Function to check if a port is in use
function Test-PortInUse {
    param([int]$Port)
    $connections = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
    return $null -ne $connections
}

# Function to kill processes on specific ports
function Stop-ProcessesOnPorts {
    param([int[]]$Ports)
    
    foreach ($port in $Ports) {
        Write-Host "Checking port $port..." -ForegroundColor Yellow
        $connections = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
        if ($connections) {
            foreach ($conn in $connections) {
                try {
                    Stop-Process -Id $conn.OwningProcess -Force -ErrorAction Stop
                    Write-Host "  Killed process PID $($conn.OwningProcess) on port $port" -ForegroundColor Green
                } catch {
                    Write-Warning "  Failed to kill process PID $($conn.OwningProcess) on port $port: $_"
                }
            }
        } else {
            Write-Host "  No processes found on port $port" -ForegroundColor Green
        }
    }
}

# Kill any existing processes on our ports
Write-Host "`n1. Cleaning up existing processes..." -ForegroundColor Yellow
Stop-ProcessesOnPorts @(5001, 3000)

# Wait a moment for processes to fully terminate
Start-Sleep -Seconds 2

# Run the verification
Write-Host "`n2. Running MOBIUS verification..." -ForegroundColor Yellow
try {
    npm run mobius:verify
    $exitCode = $LASTEXITCODE
    
    if ($exitCode -eq 0) {
        Write-Host "`n✅ Verification completed successfully!" -ForegroundColor Green
        Write-Host "================================" -ForegroundColor Cyan
        exit 0
    } else {
        Write-Host "`n❌ Verification failed with exit code $exitCode" -ForegroundColor Red
        Write-Host "================================" -ForegroundColor Cyan
        exit $exitCode
    }
} catch {
    Write-Host "`n❌ Verification failed with exception: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "================================" -ForegroundColor Cyan
    exit 1
}