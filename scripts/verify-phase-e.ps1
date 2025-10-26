# verify-phase-e.ps1
# Cross-platform verification script for Phase E implementation

Write-Host "========================================="
Write-Host "Phase E Verification Script"
Write-Host "========================================="

# Check if required tools are available
Write-Host "Checking prerequisites..."
try {
    $curlVersion = curl --version
    Write-Host "✓ curl found"
} catch {
    Write-Host "ERROR: curl is required but not found"
    exit 1
}

try {
    $nodeVersion = node --version
    Write-Host "✓ node found: $nodeVersion"
} catch {
    Write-Host "ERROR: node is required but not found"
    exit 1
}

# Set environment variables
$env:DATA_DIR = "./data"
$env:PORT = "5001"

Write-Host "Using DATA_DIR: $env:DATA_DIR"
Write-Host "Using PORT: $env:PORT"

# Create data directory if it doesn't exist
if (!(Test-Path $env:DATA_DIR)) {
    New-Item -ItemType Directory -Path $env:DATA_DIR | Out-Null
}

# Run migration script
Write-Host "Running migration script..."
npm run migrate:data

# Start server in background
Write-Host "Starting server..."
Start-Process -NoNewWindow -FilePath "node" -ArgumentList "src/api/index.js" -PassThru
Start-Sleep -Seconds 3

# Verify server is running
Write-Host "Verifying server health..."
try {
    $healthResponse = Invoke-RestMethod -Uri "http://localhost:$($env:PORT)/health" -Method Get
    if ($healthResponse.status -eq "ok") {
        Write-Host "✓ Health endpoint responding correctly"
        Write-Host "Health response: $($healthResponse | ConvertTo-Json)"
    } else {
        Write-Host "✗ Health endpoint not responding correctly"
        Write-Host "Health response: $($healthResponse | ConvertTo-Json)"
        exit 1
    }
} catch {
    Write-Host "✗ Health endpoint not responding correctly"
    Write-Host "Error: $($_.Exception.Message)"
    exit 1
}

# Verify metrics endpoint
Write-Host "Verifying metrics endpoint..."
try {
    $metricsResponse = Invoke-RestMethod -Uri "http://localhost:$($env:PORT)/metrics" -Method Get
    if ($metricsResponse.counters -ne $null) {
        Write-Host "✓ Metrics endpoint responding correctly"
        Write-Host "Metrics response: $($metricsResponse | ConvertTo-Json)"
    } else {
        Write-Host "✗ Metrics endpoint not responding correctly"
        Write-Host "Metrics response: $($metricsResponse | ConvertTo-Json)"
        exit 1
    }
} catch {
    Write-Host "✗ Metrics endpoint not responding correctly"
    Write-Host "Error: $($_.Exception.Message)"
    exit 1
}

# Test file upload (create a test file first)
Write-Host "Testing file upload..."
"This is a test file for Phase E verification" > test-upload.txt
try {
    $uploadResponse = Invoke-RestMethod -Uri "http://localhost:$($env:PORT)/api/ingest" -Method Post -Form @{
        file = Get-Item "test-upload.txt"
    }
    if ($uploadResponse.ok -eq $true) {
        Write-Host "✓ File upload successful"
        Write-Host "Upload response: $($uploadResponse | ConvertTo-Json)"
    } else {
        Write-Host "✗ File upload failed"
        Write-Host "Upload response: $($uploadResponse | ConvertTo-Json)"
        Remove-Item "test-upload.txt" -Force
        exit 1
    }
} catch {
    Write-Host "✗ File upload failed"
    Write-Host "Error: $($_.Exception.Message)"
    Remove-Item "test-upload.txt" -Force
    exit 1
}

# Clean up test file
Remove-Item "test-upload.txt" -Force

# Check if file was stored in correct location
Write-Host "Verifying file storage location..."
$uploadPath = Join-Path $env:DATA_DIR "uploads"
if (Test-Path $uploadPath) {
    $files = Get-ChildItem -Path $uploadPath
    if ($files.Count -gt 0) {
        Write-Host "✓ Files stored in correct DATA_DIR location"
        Write-Host "Files in uploads directory:"
        Get-ChildItem -Path $uploadPath | Format-Table Name, Length, LastWriteTime
    } else {
        Write-Host "✗ No files found in $uploadPath"
        exit 1
    }
} else {
    Write-Host "✗ Upload directory not found: $uploadPath"
    exit 1
}

Write-Host "========================================="
Write-Host "Phase E Verification Complete - All tests passed!"
Write-Host "========================================="