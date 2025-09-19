# Local development smoke test script
# Sets sane defaults for quick local validation

# Default configuration for local development
$Server = if ($env:SERVER) { $env:SERVER } else { "http://localhost:5001" }
$Frontend = if ($env:FRONTEND) { $env:FRONTEND } else { "http://localhost:3000" }
$TimeoutDefault = if ($env:TIMEOUT_DEFAULT) { [int]$env:TIMEOUT_DEFAULT } else { 15 }
$TimeoutPreview = if ($env:TIMEOUT_PREVIEW) { [int]$env:TIMEOUT_PREVIEW } else { 60 }

# Create artifacts directory
New-Item -ItemType Directory -Force -Path artifacts | Out-Null

# Run smoke test with local defaults
& ".\mobius_golden_path.ps1" `
  -Profile smoke `
  -Server $Server `
  -Frontend $Frontend `
  -TimeoutDefault $TimeoutDefault `
  -TimeoutPreview $TimeoutPreview `
  -JsonSummary "artifacts\summary.json" `
  -JUnitPath "artifacts\junit.xml" `
  -FailFast `
  -Quiet

Write-Host "✅ Smoke test completed successfully!" -ForegroundColor Green
Write-Host "📄 Check artifacts/summary.json for detailed results" -ForegroundColor Cyan
Write-Host "📊 Check artifacts/junit.xml for test report" -ForegroundColor Cyan