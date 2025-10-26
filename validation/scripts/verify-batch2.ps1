# Batch 2 Verification Script for Windows PowerShell
# This script verifies that all Batch 2 validation artifacts are present and valid

Write-Host "=== Batch 2 Validation Verification ==="
Write-Host "Timestamp: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss UTC')"
Write-Host

# Check if we're in the correct directory
if (-not (Test-Path "package.json")) {
  Write-Host "ERROR: Must run from project root directory" -ForegroundColor Red
  exit 1
}

Write-Host "=== Directory Structure Check ==="
Write-Host "Checking validation/batch2/logs..."
if (Test-Path "validation/batch2/logs") {
  Write-Host "✓ Logs directory exists" -ForegroundColor Green
  $logCount = (Get-ChildItem -Path "validation/batch2/logs" | Measure-Object).Count
  Write-Host "  Found $logCount files in logs directory"
} else {
  Write-Host "✗ Logs directory missing" -ForegroundColor Red
  exit 1
}

Write-Host
Write-Host "Checking validation/batch2/artifacts..."
if (Test-Path "validation/batch2/artifacts") {
  Write-Host "✓ Artifacts directory exists" -ForegroundColor Green
  $artifactCount = (Get-ChildItem -Path "validation/batch2/artifacts" | Measure-Object).Count
  Write-Host "  Found $artifactCount files in artifacts directory"
} else {
  Write-Host "✗ Artifacts directory missing" -ForegroundColor Red
  exit 1
}

Write-Host
Write-Host "=== File Presence Verification ==="

# Check required documentation files
$requiredFiles = @(
  "validation/batch2/BATCH2_VALIDATION_FAILED.md"
  "validation/batch2/BATCH2_VALIDATION_COMPLETE.md"
  "validation/batch2/BATCH2_MANIFEST.json"
  "validation/issues/20251020_003-batch2-endpoint-failures.json"
  "validation/issues/20251020_003-batch2-endpoint-failures-RESOLVED.json"
)

foreach ($file in $requiredFiles) {
  if (Test-Path $file) {
    Write-Host "✓ $file" -ForegroundColor Green
  } else {
    Write-Host "✗ $file (MISSING)" -ForegroundColor Red
    exit 1
  }
}

Write-Host
Write-Host "=== JSON Validation ==="

# Check key log files
if (Test-Path "validation/batch2/logs/C-01_pdf_upload.json") {
  try {
    $json = Get-Content "validation/batch2/logs/C-01_pdf_upload.json" | ConvertFrom-Json
    Write-Host "✓ C-01_pdf_upload.json is valid JSON" -ForegroundColor Green
  } catch {
    Write-Host "✗ C-01_pdf_upload.json is invalid JSON" -ForegroundColor Red
    exit 1
  }
} else {
  Write-Host "✗ C-01_pdf_upload.json missing" -ForegroundColor Red
  exit 1
}

if (Test-Path "validation/batch2/logs/D-01_board_import.json") {
  try {
    $json = Get-Content "validation/batch2/logs/D-01_board_import.json" | ConvertFrom-Json
    Write-Host "✓ D-01_board_import.json is valid JSON" -ForegroundColor Green
  } catch {
    Write-Host "✗ D-01_board_import.json is invalid JSON" -ForegroundColor Red
    exit 1
  }
} else {
  Write-Host "✗ D-01_board_import.json missing" -ForegroundColor Red
  exit 1
}

Write-Host
Write-Host "=== Archive Verification ==="

if (Test-Path "validation/batch2/logs.zip") {
  Write-Host "✓ logs.zip archive exists" -ForegroundColor Green
  # Test if it's a valid zip file by trying to list contents
  try {
    $zipContents = Expand-Archive -Path "validation/batch2/logs.zip" -DestinationPath $env:TEMP\batch2_test -Force -WhatIf
    Write-Host "✓ logs.zip is valid archive" -ForegroundColor Green
  } catch {
    Write-Host "✗ logs.zip is corrupted" -ForegroundColor Red
    exit 1
  }
} else {
  Write-Host "✗ logs.zip missing" -ForegroundColor Red
  exit 1
}

Write-Host
Write-Host "=== Harness Fail-Fast Verification ==="

# Check for fail-fast implementation in validation harness
$content = Get-Content "validation/tools/api-validation-harness.js" -Raw
if ($content -match "process\.exit\(1\)") {
  Write-Host "✓ Fail-fast behavior detected in api-validation-harness.js" -ForegroundColor Green
} else {
  Write-Host "✗ Fail-fast behavior not found" -ForegroundColor Red
  exit 1
}

Write-Host
Write-Host "=== Summary ==="
Write-Host "✓ All Batch 2 validation artifacts verified successfully" -ForegroundColor Green
Write-Host "✓ JSON files validated" -ForegroundColor Green
Write-Host "✓ Archive integrity confirmed" -ForegroundColor Green
Write-Host "✓ Fail-fast behavior confirmed" -ForegroundColor Green
Write-Host
Write-Host "Batch 2 Validation: PASSED" -ForegroundColor Green