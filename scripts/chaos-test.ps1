# Chaos/Resilience Smoke Tests
Write-Host "Running Chaos/Resilience Smoke Tests..." -ForegroundColor Green

# Test 1: Kill a render mid-flight
Write-Host "`nTest 1: Kill render mid-flight" -ForegroundColor Yellow
Write-Host "Manual test steps:" -ForegroundColor Cyan
Write-Host "  1. Start a long render process" -ForegroundColor White
Write-Host "  2. Identify the ffmpeg process ID" -ForegroundColor White
Write-Host "  3. Kill the ffmpeg process (taskkill /PID <pid> /F)" -ForegroundColor White
Write-Host "  4. Confirm cleanup of temp files and clear error surfaced" -ForegroundColor White

# Test 2: Disable outbound network and call /extract-components
Write-Host "`nTest 2: Network outage simulation" -ForegroundColor Yellow
Write-Host "Manual test steps:" -ForegroundColor Cyan
Write-Host "  1. Disable network connectivity temporarily" -ForegroundColor White
Write-Host "  2. Call /extract-components endpoint" -ForegroundColor White
Write-Host "  3. Expect timeout handling and user-friendly 502/504-style response" -ForegroundColor White

Write-Host "`nAcceptance Criteria:" -ForegroundColor Cyan
Write-Host "  - No orphaned temp files" -ForegroundColor White
Write-Host "  - Meaningful errors returned" -ForegroundColor White
Write-Host "  - System recovers without restart" -ForegroundColor White