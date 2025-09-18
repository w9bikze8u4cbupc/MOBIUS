# TTS Rate-limit and Budget Guard Verification
Write-Host "Verifying TTS Rate-limit and Budget Guard..." -ForegroundColor Green

# Test with excessive text length
Write-Host "`nTest 1: Excessive text length" -ForegroundColor Yellow
$longText = "A" * 100000  # 100KB of text
try {
    $response = Invoke-RestMethod -Uri "http://localhost:5001/tts" -Method POST -Body (@{text=$longText; game="Catan"; lang="en"} | ConvertTo-Json) -ContentType "application/json"
    Write-Host "  Unexpected success with excessive text" -ForegroundColor Red
} catch {
    if ($_.Exception.Response.StatusCode -eq 400 -or $_.Exception.Response.StatusCode -eq 429) {
        Write-Host "  PASS: Request blocked with status $($_.Exception.Response.StatusCode) as expected" -ForegroundColor Green
    } else {
        Write-Host "  FAIL: Expected 400/429 but got $($_.Exception.Response.StatusCode)" -ForegroundColor Red
    }
}

# Test with malformed requests
Write-Host "`nTest 2: Malformed requests" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "http://localhost:5001/tts" -Method POST -Body (@{text=""; game=""; lang=""} | ConvertTo-Json) -ContentType "application/json"
    Write-Host "  Unexpected success with empty parameters" -ForegroundColor Red
} catch {
    if ($_.Exception.Response.StatusCode -eq 400) {
        Write-Host "  PASS: Request blocked with status $($_.Exception.Response.StatusCode) as expected" -ForegroundColor Green
    } else {
        Write-Host "  FAIL: Expected 400 but got $($_.Exception.Response.StatusCode)" -ForegroundColor Red
    }
}

Write-Host "`nAcceptance Criteria:" -ForegroundColor Cyan
Write-Host "  - Excessive or malformed TTS requests get 429/400" -ForegroundColor White
Write-Host "  - No surprise billing spikes" -ForegroundColor White