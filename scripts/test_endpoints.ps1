# Test script for Mobius Tutorial Generator endpoints
Write-Host "Testing Mobius Tutorial Generator endpoints..." -ForegroundColor Green

# Test health endpoint
Write-Host "Testing health endpoint..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "http://localhost:5001/health/health" -Method Get
    Write-Host "Health endpoint response: $($response.status)" -ForegroundColor Green
}
catch {
    Write-Host "Health endpoint test failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test summarize endpoint
Write-Host "Testing summarize endpoint..." -ForegroundColor Yellow
try {
    $body = @{
        rulebookText = "This is a test rulebook text for validation purposes."
        language = "english"
        gameName = "Test Game"
        metadata = @{
            theme = "Adventure"
        }
        detailPercentage = 25
    } | ConvertTo-Json

    $response = Invoke-RestMethod -Uri "http://localhost:5001/summarize" -Method Post -Body $body -ContentType "application/json"
    Write-Host "Summarize endpoint test: Success" -ForegroundColor Green
    Write-Host "Summary length: $($response.summary.Length)" -ForegroundColor Cyan
}
catch {
    Write-Host "Summarize endpoint test failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test TTS endpoint
Write-Host "Testing TTS endpoint..." -ForegroundColor Yellow
try {
    $body = @{
        text = "This is a test of the text to speech functionality."
        voice = "dllHSct4GokGc1AH9JwT"
        language = "english"
        gameName = "Test Game"
    } | ConvertTo-Json

    $response = Invoke-RestMethod -Uri "http://localhost:5001/tts" -Method Post -Body $body -ContentType "application/json"
    Write-Host "TTS endpoint test: Success" -ForegroundColor Green
    Write-Host "Audio response length: $($response.Length)" -ForegroundColor Cyan
}
catch {
    Write-Host "TTS endpoint test failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "Endpoint testing completed." -ForegroundColor Green