# verify-phase-e-junit.ps1
# JUnit wrapper for Phase E verification script

Write-Host "========================================="
Write-Host "Phase E Verification with JUnit Output"
Write-Host "========================================="

# Create output directory for JUnit reports
$reportsDir = "test-reports"
if (!(Test-Path $reportsDir)) {
    New-Item -ItemType Directory -Path $reportsDir | Out-Null
}

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

# Test 1: Prerequisites check
Write-Host "Test 1: Checking prerequisites..."
try {
    $curlVersion = curl --version
    $nodeVersion = node --version
    Record-Test "Prerequisites Check" "PASS" ""
} catch {
    Record-Test "Prerequisites Check" "FAIL" "Required tools not found"
}

# Set environment variables
$env:DATA_DIR = "./data"
$env:PORT = "5001"

# Create data directory if it doesn't exist
if (!(Test-Path $env:DATA_DIR)) {
    New-Item -ItemType Directory -Path $env:DATA_DIR | Out-Null
}

# Test 2: Migration script
Write-Host "Test 2: Running migration script..."
try {
    npm run migrate:data | Out-Null
    Record-Test "Migration Script" "PASS" ""
} catch {
    Record-Test "Migration Script" "FAIL" "Migration script failed"
}

# Start server in background
Write-Host "Test 3: Starting server..."
Start-Process -NoNewWindow -FilePath "node" -ArgumentList "src/api/index.js" -PassThru
Start-Sleep -Seconds 3

# Test 4: Health endpoint
Write-Host "Test 4: Verifying health endpoint..."
try {
    $healthResponse = Invoke-RestMethod -Uri "http://localhost:$($env:PORT)/health" -Method Get
    if ($healthResponse.status -eq "ok") {
        Record-Test "Health Endpoint" "PASS" ""
    } else {
        Record-Test "Health Endpoint" "FAIL" "Health endpoint not responding correctly"
    }
} catch {
    Record-Test "Health Endpoint" "FAIL" "Health endpoint not responding correctly"
}

# Test 5: Metrics endpoint
Write-Host "Test 5: Verifying metrics endpoint..."
try {
    $metricsResponse = Invoke-RestMethod -Uri "http://localhost:$($env:PORT)/metrics" -Method Get
    if ($metricsResponse.counters -ne $null) {
        Record-Test "Metrics Endpoint" "PASS" ""
    } else {
        Record-Test "Metrics Endpoint" "FAIL" "Metrics endpoint not responding correctly"
    }
} catch {
    Record-Test "Metrics Endpoint" "FAIL" "Metrics endpoint not responding correctly"
}

# Test 6: File upload
Write-Host "Test 6: Testing file upload..."
"This is a test file for Phase E verification" > test-upload.txt
try {
    $uploadResponse = Invoke-RestMethod -Uri "http://localhost:$($env:PORT)/api/ingest" -Method Post -Form @{
        file = Get-Item "test-upload.txt"
    }
    if ($uploadResponse.ok -eq $true) {
        Record-Test "File Upload" "PASS" ""
    } else {
        Record-Test "File Upload" "FAIL" "File upload failed"
    }
} catch {
    Record-Test "File Upload" "FAIL" "File upload failed"
}

# Clean up test file
Remove-Item "test-upload.txt" -Force

# Test 7: File storage location
Write-Host "Test 7: Verifying file storage location..."
$uploadPath = Join-Path $env:DATA_DIR "uploads"
if (Test-Path $uploadPath) {
    $files = Get-ChildItem -Path $uploadPath
    if ($files.Count -gt 0) {
        Record-Test "File Storage" "PASS" ""
    } else {
        Record-Test "File Storage" "FAIL" "No files found in uploads directory"
    }
} else {
    Record-Test "File Storage" "FAIL" "Upload directory not found"
}

# Stop server processes
Write-Host "Stopping server..."
Stop-Process -Name "node" -Force -ErrorAction SilentlyContinue

# Print summary
Write-Host ""
Write-Host "========================================="
Write-Host "Phase E Verification Summary"
Write-Host "========================================="
Write-Host "Total Tests: $totalTests"
Write-Host "Passed: $passedTests"
Write-Host "Failed: $failedTests"
Write-Host "========================================="

# Create JUnit XML report
$xmlContent = '<?xml version="1.0" encoding="UTF-8"?>'
$xmlContent += '<testsuites>'
$xmlContent += '<testsuite name="Phase E Verification" tests="' + $totalTests + '" failures="' + $failedTests + '" errors="0" time="0">'
$xmlContent += '<testcase name="Overall Verification" time="0">'

if ($failedTests -gt 0) {
    $xmlContent += '<failure message="Some tests failed"></failure>'
}

$xmlContent += '</testcase>'
$xmlContent += '</testsuite>'
$xmlContent += '</testsuites>'

$xmlContent | Out-File -FilePath "$reportsDir\phase-e-results.xml" -Encoding UTF8

# Exit with appropriate code
if ($failedTests -eq 0) {
    Write-Host "OK - All tests passed!"
    exit 0
} else {
    Write-Host "FAIL - $failedTests tests failed"
    exit 1
}