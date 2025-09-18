# Validate that all canonical flags are documented in the README and operational guide

# Extract canonical flags from bash script
$bashFlags = @(
    "--server",
    "--frontend", 
    "--metrics-token",
    "--start-stack",
    "--local-text-pdf",
    "--local-scanned-pdf",
    "--remote-pdf",
    "--image-urls1",
    "--image-urls2",
    "--timeout-default",
    "--timeout-preview",
    "--quiet",
    "--json-summary",
    "--only",
    "--profile",
    "--fail-fast",
    "--junit",
    "--tts-cache-ratio",
    "--tts-cache-delta-ms",
    "--retry",
    "--retry-delay-ms",
    "--preview-max-ms",
    "--help"
)

# Extract canonical flags from PowerShell script
$psFlags = @(
    "-Server",
    "-Frontend",
    "-MetricsTok",
    "-StartStack",
    "-LocalTextPDF",
    "-LocalScannedPDF",
    "-RemotePDF",
    "-ImageUrls1",
    "-ImageUrls2",
    "-TimeoutDefault",
    "-TimeoutPreview",
    "-Quiet",
    "-JsonSummary",
    "-Only",
    "-Profile",
    "-FailFast",
    "-JUnitPath",
    "-TtsCacheRatio",
    "-TtsCacheDeltaMs",
    "-Retries",
    "-RetryDelayMs",
    "-PreviewMaxMs"
)

# Extract flags mentioned in documentation
$docContent = Get-Content README.md, VERIFICATION_SCRIPTS_OPERATIONAL_GUIDE.md -Raw
$docFlags = $docContent | Select-String -Pattern '[-]{1,2}[a-zA-Z0-9-]+' -AllMatches | ForEach-Object { $_.Matches } | ForEach-Object { $_.Value } | Sort-Object -Unique

# Check for missing bash flags
$missingBash = $bashFlags | Where-Object { $docFlags -notcontains $_ }
if ($missingBash.Count -gt 0) {
    Write-Host "Missing bash flags in documentation:" -ForegroundColor Red
    $missingBash | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
    exit 1
} else {
    Write-Host "All bash flags are documented." -ForegroundColor Green
}

# Check for missing PowerShell flags
$missingPS = $psFlags | Where-Object { $docFlags -notcontains $_ }
if ($missingPS.Count -gt 0) {
    Write-Host "Missing PowerShell flags in documentation:" -ForegroundColor Red
    $missingPS | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
    exit 1
} else {
    Write-Host "All PowerShell flags are documented." -ForegroundColor Green
}

Write-Host "Validation passed! All canonical flags are documented." -ForegroundColor Green