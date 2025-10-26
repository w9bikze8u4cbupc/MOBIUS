# PowerShell script to validate preview payloads
Write-Host "=== Preview Payload Validation ===" -ForegroundColor Green

# Check if Node.js is available
if (!(Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Error: Node.js is not installed or not in PATH" -ForegroundColor Red
    exit 1
}

# Check if validation script exists
if (!(Test-Path "./scripts/validatePreviewPayload.js")) {
    Write-Host "Error: Validation script not found at ./scripts/validatePreviewPayload.js" -ForegroundColor Red
    exit 1
}

# Validate minimal payload
Write-Host "Validating minimal payload..." -ForegroundColor Yellow
if (Test-Path "./preview_payload_minimal.json") {
    node ./scripts/validatePreviewPayload.js ./preview_payload_minimal.json
} else {
    Write-Host "Warning: Minimal payload file not found" -ForegroundColor Yellow
}

Write-Host ""

# Validate full payload
Write-Host "Validating full payload..." -ForegroundColor Yellow
if (Test-Path "./preview_payload_full.json") {
    node ./scripts/validatePreviewPayload.js ./preview_payload_full.json
} else {
    Write-Host "Warning: Full payload file not found" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Validation Complete ===" -ForegroundColor Green