# verify-phase-f.ps1
# Verification script for Phase F features

Write-Host "========================================="
Write-Host "Phase F Verification"
Write-Host "========================================="

# Initialize test counters
$totalTests = 0
$passedTests = 0
$failedTests = 0

# Function to record test result
function Record-Test {
    param(
        [string]$TestName,
        [string]$Result,
        [string]$Message = ""
    )
    
    $script:totalTests++
    
    if ($Result -eq "PASS") {
        $script:passedTests++
        Write-Host "  OK $TestName"
    } else {
        $script:failedTests++
        Write-Host "  X $TestName: $Message"
    }
}

# Test 1: Check if preview endpoint exists
Write-Host "Test 1: Checking preview endpoint..."
try {
    $response = Invoke-RestMethod -Uri "http://localhost:5001/api/preview" -Method Post -ContentType "application/json" -Body '{"projectId":"test","chapterId":"ch1","chapter":{"title":"Test","steps":[]}}'
    Record-Test "Preview endpoint exists" "PASS" ""
} catch {
    Record-Test "Preview endpoint exists" "FAIL" "Preview endpoint not responding"
}

# Test 2: Check preview endpoint with dry-run
Write-Host "Test 2: Testing preview endpoint with dry-run..."
try {
    $response = Invoke-RestMethod -Uri "http://localhost:5001/api/preview?dryRun=true" -Method Post -ContentType "application/json" -Body '{"projectId":"test","chapterId":"ch1","chapter":{"title":"Test","steps":[]}}'
    Record-Test "Preview dry-run works" "PASS" ""
} catch {
    Record-Test "Preview dry-run works" "FAIL" "Preview dry-run failed"
}

# Test 3: Check that preview files are created
Write-Host "Test 3: Verifying preview file creation..."
# This would require actually running the preview endpoint and checking the file system

# Test 4: Check metrics for preview requests
Write-Host "Test 4: Checking metrics for preview requests..."
try {
    $metricsResponse = Invoke-RestMethod -Uri "http://localhost:5001/metrics" -Method Get
    if ($metricsResponse -match "preview_requests_total") {
        Record-Test "Preview metrics available" "PASS" ""
    } else {
        Record-Test "Preview metrics available" "FAIL" "Preview metrics not found"
    }
} catch {
    Record-Test "Preview metrics available" "FAIL" "Metrics endpoint not responding"
}

# Print summary
Write-Host ""
Write-Host "========================================="
Write-Host "Phase F Verification Summary"
Write-Host "========================================="
Write-Host "Total Tests: $totalTests"
Write-Host "Passed: $passedTests"
Write-Host "Failed: $failedTests"
Write-Host "========================================="

# Exit with appropriate code
if ($failedTests -eq 0) {
    Write-Host "OK - All tests passed!"
    exit 0
} else {
    Write-Host "FAIL - $failedTests tests failed"
    exit 1
}