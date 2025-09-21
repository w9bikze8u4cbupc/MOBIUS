# Final Validation Script for PDF Component Extraction Improvements
Write-Host "=== PDF Component Extraction Final Validation ===" -ForegroundColor Yellow

# Test 1: Upload a real rulebook PDF
Write-Host "`nTest 1: Upload a real rulebook PDF" -ForegroundColor Cyan
$pdfPath = "C:\path\to\real-rulebook.pdf"
if (Test-Path $pdfPath) {
    try {
        $uploadResponse = Invoke-WebRequest -Uri "http://127.0.0.1:5001/upload-pdf" -Method POST -Form @{
            pdf = Get-Item $pdfPath
        } -Headers @{"X-Request-ID" = "pdf-upload-test-1"}
        
        Write-Host "✅ Upload Status: $($uploadResponse.StatusCode)" -ForegroundColor Green
        $uploadData = $uploadResponse.Content | ConvertFrom-Json
        Write-Host "PDF Path: $($uploadData.pdfPath)" -ForegroundColor Gray
        
        # Test 2: Extract components using returned path
        Write-Host "`nTest 2: Extract components from uploaded PDF" -ForegroundColor Cyan
        $extractBody = @{
            pdfPath = $uploadData.pdfPath
        } | ConvertTo-Json
        
        $extractResponse = Invoke-WebRequest -Uri "http://127.0.0.1:5001/api/extract-components" -Method POST -Body $extractBody -ContentType "application/json" -Headers @{"X-Request-ID" = "pdf-comp-1"}
        
        Write-Host "✅ Extraction Status: $($extractResponse.StatusCode)" -ForegroundColor Green
        $extractData = $extractResponse.Content | ConvertFrom-Json
        Write-Host "Components found: $(if ($extractData.components) { $extractData.components.Count } else { 0 })" -ForegroundColor Gray
        Write-Host "Extraction method: $($extractData.extractionMethod)" -ForegroundColor Gray
        
        if ($extractData.components -and $extractData.components.Count -gt 0) {
            Write-Host "✅ Successfully extracted components:" -ForegroundColor Green
            $extractData.components | ForEach-Object {
                Write-Host "  - $($_.name): $($_.count)" -ForegroundColor Gray
            }
        }
    } catch {
        Write-Host "❌ Upload/Extraction failed: $($_.Exception.Message)" -ForegroundColor Red
        if ($_.Exception.Response) {
            $responseStream = $_.Exception.Response.GetResponseStream()
            $reader = New-Object System.IO.StreamReader($responseStream)
            $responseBody = $reader.ReadToEnd()
            Write-Host "Response: $responseBody" -ForegroundColor Red
        }
    }
} else {
    Write-Host "⚠️  Real rulebook PDF not found at $pdfPath" -ForegroundColor Yellow
    Write-Host "Please update the path in this script to point to a real PDF rulebook." -ForegroundColor Yellow
}

# Test 3: Test error handling with our test PDFs
Write-Host "`nTest 3: Testing error handling with test PDFs" -ForegroundColor Cyan

# Test with our valid small PDF
$testPdfPath = "tests/fixtures/valid-small.pdf"
if (Test-Path $testPdfPath) {
    try {
        Write-Host "Testing with valid-small.pdf..." -ForegroundColor Gray
        $uploadResponse = Invoke-WebRequest -Uri "http://127.0.0.1:5001/upload-pdf" -Method POST -Form @{
            pdf = Get-Item $testPdfPath
        } -Headers @{"X-Request-ID" = "pdf-error-test-1"}
        
        $uploadData = $uploadResponse.Content | ConvertFrom-Json
        Write-Host "✅ Upload successful" -ForegroundColor Green
        
        # Try to extract components
        $extractBody = @{
            pdfPath = $uploadData.pdfPath
        } | ConvertTo-Json
        
        $extractResponse = Invoke-WebRequest -Uri "http://127.0.0.1:5001/api/extract-components" -Method POST -Body $extractBody -ContentType "application/json" -Headers @{"X-Request-ID" = "pdf-error-test-2"}
        
        Write-Host "✅ Extraction completed" -ForegroundColor Green
        $extractData = $extractResponse.Content | ConvertFrom-Json
        Write-Host "Components found: $(if ($extractData.components) { $extractData.components.Count } else { 0 })" -ForegroundColor Gray
    } catch {
        Write-Host "Expected error response:" -ForegroundColor Yellow
        if ($_.Exception.Response) {
            $statusCode = $_.Exception.Response.StatusCode.value__
            Write-Host "Status Code: $statusCode" -ForegroundColor Gray
            
            $responseStream = $_.Exception.Response.GetResponseStream()
            $reader = New-Object System.IO.StreamReader($responseStream)
            $responseBody = $reader.ReadToEnd()
            $errorData = $responseBody | ConvertFrom-Json
            
            Write-Host "Error Code: $($errorData.code)" -ForegroundColor Gray
            Write-Host "Message: $($errorData.message)" -ForegroundColor Gray
            
            # Check if it's one of our expected error codes
            switch ($errorData.code) {
                "pdf_no_text_content" {
                    Write-Host "✅ Correctly detected PDF with no text content" -ForegroundColor Green
                }
                "components_not_found" {
                    Write-Host "✅ Correctly detected PDF with text but no recognizable components" -ForegroundColor Green
                }
                default {
                    Write-Host "ℹ️  Other error code detected" -ForegroundColor Yellow
                }
            }
        }
    }
} else {
    Write-Host "⚠️  Test PDF not found at $testPdfPath" -ForegroundColor Yellow
}

Write-Host "`n=== Validation Complete ===" -ForegroundColor Yellow
Write-Host "Check server logs for X-Request-ID tracing and diagnostics" -ForegroundColor Gray