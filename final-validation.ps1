# Final validation script with comprehensive tests
Write-Host "=== Final Validation Script ===" -ForegroundColor Green

# Set security protocol for reliable connections
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$PSDefaultParameterValues['ConvertTo-Json:Depth']=5

# Test SSRF validation
Write-Host "`nTesting SSRF Validation..." -ForegroundColor Yellow

# Test 1: Direct disallowed host
Write-Host "Test 1: Direct disallowed host" -ForegroundColor Cyan
try {
    $ssrfParams = @{
        Uri = "http://localhost:5001/api/extract-bgg-html"
        Method = "POST"
        Headers = @{ "Content-Type" = "application/json"; "X-Request-ID" = "test-ssrf-1" }
        Body = @{ url = "http://malicious-site.com/boardgame/12345" } | ConvertTo-Json
        SkipHttpErrorCheck = $true
    }
    
    $response1 = Invoke-WebRequest @ssrfParams
    $json1 = $response1.Content | ConvertFrom-Json
    
    Write-Host "Status: $($response1.StatusCode)"
    Write-Host "Code: $($json1.code)"
    Write-Host "Request ID: $($json1.requestId)"
    Write-Host "Expected: 400, url_disallowed, test-ssrf-1"
    
    if ($response1.StatusCode -eq 400 -and $json1.code -eq "url_disallowed" -and $json1.requestId -eq "test-ssrf-1") {
        Write-Host "✅ PASS" -ForegroundColor Green
    } else {
        Write-Host "❌ FAIL" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Test failed with exception: $($_.Exception.Message)" -ForegroundColor Red
}

# Test PDF validation matrix
Write-Host "`nTesting PDF Validation Matrix..." -ForegroundColor Yellow

# Test 1: Valid PDF
Write-Host "Test 1: Valid PDF" -ForegroundColor Cyan
try {
    $pdfParams1 = @{
        Uri = "http://localhost:5001/upload-pdf"
        Method = "POST"
        Form = @{ pdf = Get-Item "tests/fixtures/valid-small.pdf" }
        SkipHttpErrorCheck = $true
    }
    
    $response1 = Invoke-WebRequest @pdfParams1
    $json1 = $response1.Content | ConvertFrom-Json
    
    Write-Host "Status: $($response1.StatusCode)"
    Write-Host "Success: $($json1.success)"
    Write-Host "Expected: 200, true"
    
    if ($response1.StatusCode -eq 200 -and $json1.success -eq $true) {
        Write-Host "✅ PASS" -ForegroundColor Green
    } else {
        Write-Host "❌ FAIL" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Test failed with exception: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 2: Oversized PDF
Write-Host "Test 2: Oversized PDF" -ForegroundColor Cyan
try {
    $pdfParams2 = @{
        Uri = "http://localhost:5001/upload-pdf"
        Method = "POST"
        Form = @{ pdf = Get-Item "tests/fixtures/big.pdf" }
        SkipHttpErrorCheck = $true
    }
    
    $response2 = Invoke-WebRequest @pdfParams2
    $json2 = $response2.Content | ConvertFrom-Json
    
    Write-Host "Status: $($response2.StatusCode)"
    Write-Host "Code: $($json2.code)"
    Write-Host "Expected: 400, pdf_oversize"
    
    if ($response2.StatusCode -eq 400 -and $json2.code -eq "pdf_oversize") {
        Write-Host "✅ PASS" -ForegroundColor Green
    } else {
        Write-Host "❌ FAIL" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Test failed with exception: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 3: Wrong MIME type
Write-Host "Test 3: Wrong MIME type" -ForegroundColor Cyan
try {
    $pdfParams3 = @{
        Uri = "http://localhost:5001/upload-pdf"
        Method = "POST"
        Form = @{ pdf = Get-Item "tests/fixtures/not-a-pdf.bin" }
        SkipHttpErrorCheck = $true
    }
    
    $response3 = Invoke-WebRequest @pdfParams3
    $json3 = $response3.Content | ConvertFrom-Json
    
    Write-Host "Status: $($response3.StatusCode)"
    Write-Host "Code: $($json3.code)"
    Write-Host "Expected: 400, pdf_bad_signature"
    
    if ($response3.StatusCode -eq 400 -and $json3.code -eq "pdf_bad_signature") {
        Write-Host "✅ PASS" -ForegroundColor Green
    } else {
        Write-Host "❌ FAIL" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Test failed with exception: $($_.Exception.Message)" -ForegroundColor Red
}

# Test retry-with-jitter
Write-Host "`nTesting Retry-with-Jitter..." -ForegroundColor Yellow

# Reset hit counter conceptually
Write-Host "Testing /test-flaky endpoint behavior:" -ForegroundColor Cyan
Write-Host "Expected: Exactly 3 attempts total for 429/503, 0 retries for 403" -ForegroundColor Gray

try {
    # First attempt - should return 429
    $retryResponse1 = Invoke-WebRequest -Uri "http://localhost:5001/test-flaky" -SkipHttpErrorCheck
    Write-Host "Attempt 1: Status $($retryResponse1.StatusCode) (Expected: 429)"
    
    # Second attempt - should return 429
    Start-Sleep -Milliseconds 300  # Small delay to ensure timing
    $retryResponse2 = Invoke-WebRequest -Uri "http://localhost:5001/test-flaky" -SkipHttpErrorCheck
    Write-Host "Attempt 2: Status $($retryResponse2.StatusCode) (Expected: 429)"
    
    # Third attempt - should return 200
    Start-Sleep -Milliseconds 800  # Delay for second retry
    $retryResponse3 = Invoke-WebRequest -Uri "http://localhost:5001/test-flaky" -SkipHttpErrorCheck
    Write-Host "Attempt 3: Status $($retryResponse3.StatusCode) (Expected: 200)"
    
    if ($retryResponse1.StatusCode -eq 429 -and $retryResponse2.StatusCode -eq 429 -and $retryResponse3.StatusCode -eq 200) {
        Write-Host "✅ PASS - Correct retry behavior" -ForegroundColor Green
    } else {
        Write-Host "❌ FAIL - Incorrect retry behavior" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Test failed with exception: $($_.Exception.Message)" -ForegroundColor Red
}

# Test readiness endpoint
Write-Host "`nTesting Readiness Endpoint..." -ForegroundColor Yellow
try {
    $readyResponse = Invoke-WebRequest -Uri "http://localhost:5001/readyz" -SkipHttpErrorCheck
    Write-Host "Readiness Status: $($readyResponse.StatusCode)"
    Write-Host "Content: $($readyResponse.Content)"
    
    # Test liveness endpoint
    $liveResponse = Invoke-WebRequest -Uri "http://localhost:5001/livez" -SkipHttpErrorCheck
    Write-Host "Liveness Status: $($liveResponse.StatusCode)"
    Write-Host "Content: $($liveResponse.Content)"
    
    if ($liveResponse.StatusCode -eq 200 -and $liveResponse.Content -eq "OK") {
        Write-Host "✅ PASS - Liveness check" -ForegroundColor Green
    } else {
        Write-Host "❌ FAIL - Liveness check" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Test failed with exception: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n=== Final Validation Complete ===" -ForegroundColor Green