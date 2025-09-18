# Metrics Sanity Check Script
Write-Host "Verifying Metrics Counters..." -ForegroundColor Green

# Start the server in background
Write-Host "Starting server..." -ForegroundColor Yellow
Start-Process -FilePath "node" -ArgumentList "start-server.js" -WorkingDirectory "c:\Users\danie\Documents\mobius-games-tutorial-generator" -WindowStyle Hidden

# Wait a moment for server to start
Start-Sleep -Seconds 3

# Hit TTS twice (expect 2 requests, ≥1 cache hit)
Write-Host "Making TTS requests..." -ForegroundColor Yellow

try {
    # First request
    Invoke-RestMethod -Uri "http://localhost:5001/tts" -Method POST -Body (@{text="cache check"; game="Catan"; lang="en"} | ConvertTo-Json) -ContentType "application/json" -OutFile "test1.mp3" | Out-Null
    Write-Host "  First TTS request completed" -ForegroundColor Green
    
    # Second request (should hit cache)
    Invoke-RestMethod -Uri "http://localhost:5001/tts" -Method POST -Body (@{text="cache check"; game="Catan"; lang="en"} | ConvertTo-Json) -ContentType "application/json" -OutFile "test2.mp3" | Out-Null
    Write-Host "  Second TTS request completed (should hit cache)" -ForegroundColor Green
    
    # Wait a moment for metrics to update
    Start-Sleep -Seconds 1
    
    # Inspect metrics
    Write-Host "Inspecting metrics..." -ForegroundColor Yellow
    $metrics = Invoke-WebRequest -Uri "http://localhost:5001/metrics" -UseBasicParsing | Select-Object -Expand Content
    
    Write-Host "Current metrics:" -ForegroundColor Cyan
    Write-Host $metrics -ForegroundColor White
    
    # Check for expected counters
    $ttsRequests = [regex]::Match($metrics, "tts_requests_total (\d+)").Groups[1].Value
    $ttsCacheHits = [regex]::Match($metrics, "tts_cache_hits_total (\d+)").Groups[1].Value
    
    Write-Host "`nMetrics Analysis:" -ForegroundColor Cyan
    Write-Host "  TTS Requests Total: $ttsRequests" -ForegroundColor White
    Write-Host "  TTS Cache Hits Total: $ttsCacheHits" -ForegroundColor White
    
    # Verify acceptance criteria
    if ([int]$ttsRequests -eq 2) {
        Write-Host "  ✓ tts_requests_total increases by 2" -ForegroundColor Green
    } else {
        Write-Host "  ✗ tts_requests_total should be 2 but is $ttsRequests" -ForegroundColor Red
    }
    
    if ([int]$ttsCacheHits -ge 1) {
        Write-Host "  ✓ tts_cache_hits_total increases by ≥1" -ForegroundColor Green
    } else {
        Write-Host "  ✗ tts_cache_hits_total should be ≥1 but is $ttsCacheHits" -ForegroundColor Red
    }
    
    # Check for HTTP request duration metrics
    if ($metrics -match "http_request_duration_seconds") {
        Write-Host "  ✓ http_request_duration_seconds_* present" -ForegroundColor Green
    } else {
        Write-Host "  ✗ http_request_duration_seconds_* missing" -ForegroundColor Red
    }
    
    # Clean up test files
    if (Test-Path "test1.mp3") { Remove-Item "test1.mp3" }
    if (Test-Path "test2.mp3") { Remove-Item "test2.mp3" }
    
} catch {
    Write-Host "Error during metrics verification: $($_.Exception.Message)" -ForegroundColor Red
} finally {
    # Stop the server
    Write-Host "Stopping server..." -ForegroundColor Yellow
    Stop-Process -Name "node" -Force -ErrorAction SilentlyContinue
}

Write-Host "`nMetrics verification complete!" -ForegroundColor Cyan