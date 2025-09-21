# Updated validation script with assertions for structured error codes and status codes

Write-Host "=== Updated Validation Script ===" -ForegroundColor Green

# Test SSRF allowlist negative cases
Write-Host "Testing SSRF allowlist negative cases..." -ForegroundColor Yellow

# Test disallowed URL
$response = Invoke-WebRequest -Uri "http://127.0.0.1:5001/api/extract-bgg-html" -Method POST -Body @{url="http://malicious.com"} -SkipHttpErrorCheck
$json = $response.Content | ConvertFrom-Json

# Assertions
if ($response.StatusCode -ne 400 -or $json.code -ne "url_disallowed") {
    Write-Host "❌ SSRF negative test failed: Expected 400 with code=url_disallowed" -ForegroundColor Red
    Write-Host "   Got status: $($response.StatusCode), code: $($json.code)" -ForegroundColor Red
} else {
    Write-Host "✅ SSRF negative test passed" -ForegroundColor Green
}

# Test PDF validation cases
Write-Host "Testing PDF validation cases..." -ForegroundColor Yellow

# Test valid PDF
try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:5001/upload-pdf" -Method POST -Form @{
        pdf = Get-Item "tests/fixtures/small-valid.pdf"
    } -SkipHttpErrorCheck
    $json = $response.Content | ConvertFrom-Json
    
    if ($response.StatusCode -eq 200 -and $json.success -eq $true) {
        Write-Host "✅ Valid PDF test passed" -ForegroundColor Green
    } else {
        Write-Host "❌ Valid PDF test failed: Expected 200 with success=true" -ForegroundColor Red
        Write-Host "   Got status: $($response.StatusCode), success: $($json.success)" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Valid PDF test failed with exception: $($_.Exception.Message)" -ForegroundColor Red
}

# Test wrong MIME type
try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:5001/upload-pdf" -Method POST -Form @{
        pdf = Get-Item "tests/fixtures/not-a-pdf.bin"
    } -SkipHttpErrorCheck
    $json = $response.Content | ConvertFrom-Json
    
    if ($response.StatusCode -eq 400 -and $json.code -eq "pdf_bad_signature") {
        Write-Host "✅ Wrong MIME test passed" -ForegroundColor Green
    } else {
        Write-Host "❌ Wrong MIME test failed: Expected 400 with code=pdf_bad_signature" -ForegroundColor Red
        Write-Host "   Got status: $($response.StatusCode), code: $($json.code)" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Wrong MIME test failed with exception: $($_.Exception.Message)" -ForegroundColor Red
}

# Test oversize PDF
try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:5001/upload-pdf" -Method POST -Form @{
        pdf = Get-Item "tests/fixtures/big.pdf"
    } -SkipHttpErrorCheck
    $json = $response.Content | ConvertFrom-Json
    
    if ($response.StatusCode -eq 400 -and $json.code -eq "pdf_oversize") {
        Write-Host "✅ Oversize PDF test passed" -ForegroundColor Green
    } else {
        Write-Host "❌ Oversize PDF test failed: Expected 400 with code=pdf_oversize" -ForegroundColor Red
        Write-Host "   Got status: $($response.StatusCode), code: $($json.code)" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Oversize PDF test failed with exception: $($_.Exception.Message)" -ForegroundColor Red
}

# Test retry-with-jitter
Write-Host "Testing retry-with-jitter..." -ForegroundColor Yellow

# Reset hit counter by restarting the test
$response = Invoke-WebRequest -Uri "http://127.0.0.1:5001/test-flaky" -SkipHttpErrorCheck
# First attempt should fail with 429
if ($response.StatusCode -eq 429) {
    Write-Host "✅ First retry test passed (429 response)" -ForegroundColor Green
} else {
    Write-Host "❌ First retry test failed: Expected 429, got $($response.StatusCode)" -ForegroundColor Red
}

# Second attempt should also fail with 429
$response = Invoke-WebRequest -Uri "http://127.0.0.1:5001/test-flaky" -SkipHttpErrorCheck
if ($response.StatusCode -eq 429) {
    Write-Host "✅ Second retry test passed (429 response)" -ForegroundColor Green
} else {
    Write-Host "❌ Second retry test failed: Expected 429, got $($response.StatusCode)" -ForegroundColor Red
}

# Third attempt should succeed with 200
$response = Invoke-WebRequest -Uri "http://127.0.0.1:5001/test-flaky" -SkipHttpErrorCheck
if ($response.StatusCode -eq 200) {
    Write-Host "✅ Third retry test passed (200 response)" -ForegroundColor Green
} else {
    Write-Host "❌ Third retry test failed: Expected 200, got $($response.StatusCode)" -ForegroundColor Red
}

Write-Host "=== Validation Complete ===" -ForegroundColor Green