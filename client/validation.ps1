# Validation Script for fetchJson Implementation
# Run this script after starting the development server

# Set TLS protocol for secure connections
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

Write-Host "=== fetchJson Implementation Validation ===" -ForegroundColor Green
Write-Host ""

# Check if server is running
Write-Host "1. Checking if development server is running..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000" -Method HEAD -TimeoutSec 5
    if ($response.StatusCode -eq 200) {
        Write-Host "   ✓ Server is running on port 3000" -ForegroundColor Green
    } else {
        Write-Host "   ✗ Server returned status code $($response.StatusCode)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "   ✗ Server is not running on port 3000" -ForegroundColor Red
    Write-Host "   Please start the development server with 'npm start'" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "2. Checking environment variables..." -ForegroundColor Yellow
$envContent = Get-Content -Path ".env" -ErrorAction SilentlyContinue
if ($envContent -match "REACT_APP_SHOW_DEV_TEST=true") {
    Write-Host "   ✓ REACT_APP_SHOW_DEV_TEST is set to true" -ForegroundColor Green
} else {
    Write-Host "   ! REACT_APP_SHOW_DEV_TEST is not set to true or .env file not found" -ForegroundColor Yellow
    Write-Host "   The DevTestPage may not be visible" -ForegroundColor Yellow
}

if ($envContent -match "REACT_APP_QA_LABELS=true") {
    Write-Host "   ✓ REACT_APP_QA_LABELS is set to true" -ForegroundColor Green
} else {
    Write-Host "   ! REACT_APP_QA_LABELS is not set to true or .env file not found" -ForegroundColor Yellow
    Write-Host "   DebugChips may not be visible" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "3. Manual Validation Steps (Open browser to http://localhost:3000):" -ForegroundColor Yellow
Write-Host "   a. Verify you see the 'Dev Test Page' heading" -ForegroundColor Cyan
Write-Host "   b. Click 'Call Health' button" -ForegroundColor Cyan
Write-Host "      - Expect: Success toast message" -ForegroundColor Cyan
Write-Host "      - Expect: DebugChips info panel shows requestId, latency, source" -ForegroundColor Cyan
Write-Host "   c. Click 'Call Oversize (413)' button multiple times rapidly" -ForegroundColor Cyan
Write-Host "      - Expect: Only one error toast despite multiple clicks" -ForegroundColor Cyan
Write-Host "   d. Click 'Call Network Fail' button multiple times rapidly" -ForegroundColor Cyan
Write-Host "      - Expect: Only one error toast despite internal retries" -ForegroundColor Cyan

Write-Host ""
Write-Host "4. QA Gating Validation:" -ForegroundColor Yellow
Write-Host "   a. Set REACT_APP_QA_LABELS=false in .env" -ForegroundColor Cyan
Write-Host "   b. Restart dev server" -ForegroundColor Cyan
Write-Host "   c. Click 'Call Health'" -ForegroundColor Cyan
Write-Host "      - Expect: Success toast appears" -ForegroundColor Cyan
Write-Host "      - Expect: DebugChips info panel does NOT appear" -ForegroundColor Cyan

Write-Host ""
Write-Host "5. Restore Normal App:" -ForegroundColor Yellow
Write-Host "   a. Set REACT_APP_SHOW_DEV_TEST=false in .env" -ForegroundColor Cyan
Write-Host "   b. Restart dev server" -ForegroundColor Cyan
Write-Host "   c. Confirm normal App component is rendered" -ForegroundColor Cyan

Write-Host ""
Write-Host "=== Validation Complete ===" -ForegroundColor Green