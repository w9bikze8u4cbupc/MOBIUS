# CI Guardrail Script - Docs Parity Check
# Prevents drift between script flags and documentation

Write-Host "Running documentation parity check..." -ForegroundColor Cyan

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
    "--dry-run",
    "--version",
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
    "-RetryCount",
    "-RetryDelayMs",
    "-PreviewMaxMs",
    "-DryRun",
    "-Version"
)

# Extract flags mentioned in documentation
$docContent = Get-Content README.md, VERIFICATION_SCRIPTS_OPERATIONAL_GUIDE.md -Raw
$docFlags = $docContent | Select-String -Pattern '[-]{1,2}[a-zA-Z0-9-]+' -AllMatches | ForEach-Object { $_.Matches } | ForEach-Object { $_.Value } | Sort-Object -Unique

# Check for missing bash flags
$missingBash = $bashFlags | Where-Object { $docFlags -notcontains $_ }
if ($missingBash.Count -gt 0) {
    Write-Host "ERROR: Missing bash flags in documentation:" -ForegroundColor Red
    $missingBash | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
    exit 1
}

# Check for missing PowerShell flags
$missingPS = $psFlags | Where-Object { $docFlags -notcontains $_ }
if ($missingPS.Count -gt 0) {
    Write-Host "ERROR: Missing PowerShell flags in documentation:" -ForegroundColor Red
    $missingPS | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
    exit 1
}

# Enhanced check: Extract flags from PowerShell script param block
$psScriptContent = Get-Content mobius_golden_path.ps1 -Raw
$psParamFlags = $psScriptContent | Select-String -Pattern '\$(\w+)' -AllMatches | ForEach-Object { $_.Matches } | ForEach-Object { 
    $paramName = $_.Groups[1].Value
    if ($paramName -ne "PSBoundParameters" -and $paramName -ne "null") {
        "-$paramName"
    }
} | Where-Object { $_ -ne $null } | Sort-Object -Unique

# Filter out non-flag parameters
$psParamFlags = $psParamFlags | Where-Object { 
    $_ -in $psFlags
}

# Check if all PowerShell param flags are documented
$missingPSParam = $psParamFlags | Where-Object { $docFlags -notcontains $_ }
if ($missingPSParam.Count -gt 0) {
    Write-Host "ERROR: Missing PowerShell param flags in documentation:" -ForegroundColor Red
    $missingPSParam | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
    exit 1
}

Write-Host "SUCCESS: All canonical flags are documented." -ForegroundColor Green
exit 0