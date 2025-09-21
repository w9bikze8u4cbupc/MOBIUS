# Comprehensive validation script for Mobius Games Tutorial Generator
# PowerShell version for Windows compatibility

# Set security protocol for reliable connections
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$PSDefaultParameterValues['ConvertTo-Json:Depth']=5

$BASE = "http://127.0.0.1:5001"

Write-Host "=== Mobius Games Tutorial Generator Comprehensive Validation ===" -ForegroundColor Green

Write-Host ""
Write-Host "1. Health checks" -ForegroundColor Yellow
Write-Host "Healthz endpoint:"
try {
    $healthzResponse = Invoke-WebRequest -Uri "$BASE/healthz" -Method GET
    Write-Host "Status: $($healthzResponse.StatusCode) - $($healthzResponse.Content)" -ForegroundColor Cyan
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "Readyz endpoint:"
try {
    $readyzResponse = Invoke-WebRequest -Uri "$BASE/readyz" -Method GET
    Write-Host "Status: $($readyzResponse.StatusCode)" -ForegroundColor Cyan
    Write-Host "Content: $($readyzResponse.Content)" -ForegroundColor Cyan
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "2. BGG HTML path with multiple IDs" -ForegroundColor Yellow
$testUrls = @(
    "https://boardgamegeek.com/boardgame/174430/gloomhaven",
    "https://boardgamegeek.com/boardgame/13/catan",
    "https://boardgamegeek.com/boardgame/68448/7-wonders"
)

foreach ($url in $testUrls) {
    try {
        $bggBody = @{
            url = $url
        } | ConvertTo-Json
        
        $bggResponse = Invoke-WebRequest -Uri "$BASE/api/extract-bgg-html" -Method POST -Body $bggBody -ContentType "application/json"
        $bggData = $bggResponse.Content | ConvertFrom-Json
        Write-Host "URL: $url" -ForegroundColor Gray
        Write-Host "  Success: $($bggData.success)" -ForegroundColor Cyan
        Write-Host "  Source: $($bggData.source)" -ForegroundColor Cyan
        Write-Host "  Title: $($bggData.metadata.title)" -ForegroundColor Cyan
    } catch {
        Write-Host "URL: $url" -ForegroundColor Gray
        Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "3. Testing correlation IDs" -ForegroundColor Yellow
try {
    $correlationId = "validation-test-$([int][double]::Parse((Get-Date -UFormat %s)))"
    $bggBody = @{
        url = "https://boardgamegeek.com/boardgame/68448"
    } | ConvertTo-Json
    
    $bggResponse = Invoke-WebRequest -Uri "$BASE/api/extract-bgg-html" -Method POST -Body $bggBody -ContentType "application/json" -Headers @{"X-Request-ID" = $correlationId}
    $bggData = $bggResponse.Content | ConvertFrom-Json
    Write-Host "Success: $($bggData.success)" -ForegroundColor Cyan
    Write-Host "Source: $($bggData.source)" -ForegroundColor Cyan
    Write-Host "Response X-Request-ID: $($bggResponse.Headers["X-Request-ID"])" -ForegroundColor Cyan
    if ($bggResponse.Headers["X-Request-ID"] -eq $correlationId) {
        Write-Host "  ✅ Correlation ID correctly echoed" -ForegroundColor Green
    } else {
        Write-Host "  ❌ Correlation ID not echoed correctly" -ForegroundColor Red
    }
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "4. SSRF allowlist testing" -ForegroundColor Yellow
Write-Host "Testing disallowed URL (https://example.com):" -ForegroundColor Gray
try {
    $bggBody = @{
        url = "https://example.com"
    } | ConvertTo-Json
    
    $bggResponse = Invoke-WebRequest -Uri "$BASE/api/extract-bgg-html" -Method POST -Body $bggBody -ContentType "application/json"
    Write-Host "  Unexpected success: $($bggResponse.StatusCode)" -ForegroundColor Red
} catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 400) {
        Write-Host "  ✅ Correctly rejected with 400" -ForegroundColor Green
    } else {
        Write-Host "  ❌ Unexpected error: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "5. PDF validation matrix" -ForegroundColor Yellow
Write-Host "Note: This requires actual PDF files to test. Skipping for now." -ForegroundColor Gray

Write-Host ""
Write-Host "=== Validation Complete ===" -ForegroundColor Green