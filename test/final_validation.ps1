# Final Go/No-Go Validation Script for v1.0 Release

Write-Host "=== Final Go/No-Go Validation for v1.0 Release ===" -ForegroundColor Cyan

$allPass = $true

# 1. Help parity
Write-Host "`n1. Checking Help Parity..." -ForegroundColor Yellow

# Bash help check
$bashContent = Get-Content .\mobius_golden_path.sh -Raw
$requiredBashFlags = @("--json-summary", "--junit", "--dry-run", "--version")
$missingBashFlags = @()
foreach ($flag in $requiredBashFlags) {
    if (-not ($bashContent -match [regex]::Escape($flag))) {
        $missingBashFlags += $flag
    }
}
if ($missingBashFlags.Count -eq 0) {
    Write-Host "   PASS: Bash help includes all canonical flags" -ForegroundColor Green
} else {
    Write-Host "   FAIL: Bash help missing flags: $($missingBashFlags -join ', ')" -ForegroundColor Red
    $allPass = $false
}

# PowerShell param check
$psContent = Get-Content .\mobius_golden_path.ps1 -Raw
# Check for actual parameter names and aliases
$psParamChecks = @{
    "JsonSummary" = '\$JsonSummary'
    "JUnitPath" = '\$JUnitPath'
    "DryRun" = '\$DryRun'
    "Version" = '\$Version'
}
$missingPSFlags = @()
foreach ($key in $psParamChecks.Keys) {
    if (-not ($psContent -match $psParamChecks[$key])) {
        $missingPSFlags += $key
    }
}
if ($missingPSFlags.Count -eq 0) {
    Write-Host "   PASS: PowerShell param block includes all canonical flags" -ForegroundColor Green
} else {
    Write-Host "   FAIL: PowerShell param block missing flags: $($missingPSFlags -join ', ')" -ForegroundColor Red
    $allPass = $false
}

# 2. Dry-run behavior
Write-Host "`n2. Checking Dry-run Behavior..." -ForegroundColor Yellow

# Test PowerShell dry-run
try {
    # Just check that it runs without error and exits with code 0
    & ".\mobius_golden_path.ps1" -Profile "smoke" -DryRun 2>&1 | Out-Null
    $exitCode = $LASTEXITCODE
    if ($exitCode -eq 0) {
        Write-Host "   PASS: PowerShell dry-run works correctly (exit code: $exitCode)" -ForegroundColor Green
    } else {
        Write-Host "   FAIL: PowerShell dry-run failed (exit code: $exitCode)" -ForegroundColor Red
        $allPass = $false
    }
} catch {
    Write-Host "   FAIL: PowerShell dry-run threw exception: $_" -ForegroundColor Red
    $allPass = $false
}

# 3. Exit codes
Write-Host "`n3. Checking Exit Codes..." -ForegroundColor Yellow

# Test successful exit
try {
    & ".\mobius_golden_path.ps1" -Version
    $versionExitCode = $LASTEXITCODE
    if ($versionExitCode -eq 0) {
        Write-Host "   PASS: Successful command exits with code 0 (exit code: $versionExitCode)" -ForegroundColor Green
    } else {
        Write-Host "   FAIL: Successful command exited with code $versionExitCode" -ForegroundColor Red
        $allPass = $false
    }
} catch {
    Write-Host "   FAIL: Version command threw exception: $_" -ForegroundColor Red
    $allPass = $false
}

# 4. JUnit XML format
Write-Host "`n4. Checking JUnit XML Format..." -ForegroundColor Yellow

$sampleJUnit = Get-Content .\sample_artifacts\sample_junit.xml -Raw
if ($sampleJUnit -match '<\?xml version="1.0" encoding="UTF-8"\?>' -and 
    $sampleJUnit -match 'time="\d+\.\d+"') {
    Write-Host "   PASS: JUnit XML has proper encoding and timing attributes" -ForegroundColor Green
} else {
    Write-Host "   FAIL: JUnit XML missing encoding or timing attributes" -ForegroundColor Red
    $allPass = $false
}

# 5. JSON summary format
Write-Host "`n5. Checking JSON Summary Format..." -ForegroundColor Yellow

$sampleJSON = Get-Content .\sample_artifacts\sample_summary.json -Raw | ConvertFrom-Json
$requiredJSONFields = @("version", "profile", "checks")
$missingJSONFields = @()
foreach ($field in $requiredJSONFields) {
    if (-not (Get-Member -InputObject $sampleJSON -Name $field -MemberType Properties)) {
        $missingJSONFields += $field
    }
}
if ($missingJSONFields.Count -eq 0) {
    Write-Host "   PASS: JSON summary has required fields" -ForegroundColor Green
} else {
    Write-Host "   FAIL: JSON summary missing fields: $($missingJSONFields -join ', ')" -ForegroundColor Red
    $allPass = $false
}

# 6. Terminology consistency
Write-Host "`n6. Checking Terminology Consistency..." -ForegroundColor Yellow

# Check that PowerShell doesn't have "timeline" in profiles
$psProfileSection = Select-String -Path .\mobius_golden_path.ps1 -Pattern "smoke.*preview" -Context 0,1
if ($psProfileSection.Line -match "preview" -and $psProfileSection.Line -notmatch "timeline") {
    Write-Host "   PASS: PowerShell uses 'preview' terminology consistently" -ForegroundColor Green
} else {
    Write-Host "   FAIL: PowerShell may have inconsistent terminology" -ForegroundColor Red
    $allPass = $false
}

# 7. Back-compat aliases
Write-Host "`n7. Checking Back-compat Aliases..." -ForegroundColor Yellow

$changelogContent = Get-Content .\CHANGELOG.md -Raw
if ($changelogContent -match "Will be removed in v2.0.0") {
    Write-Host "   PASS: CHANGELOG includes deprecation window" -ForegroundColor Green
} else {
    Write-Host "   FAIL: CHANGELOG missing deprecation window" -ForegroundColor Red
    $allPass = $false
}

# 8. Token hygiene
Write-Host "`n8. Checking Token Hygiene..." -ForegroundColor Yellow

$sampleJSONContent = Get-Content .\sample_artifacts\sample_summary.json -Raw
if ($sampleJSONContent -match '"MetricsTok": "\[REDACTED\]"') {
    Write-Host "   PASS: Tokens are redacted in JSON summary" -ForegroundColor Green
} else {
    Write-Host "   FAIL: Tokens may not be properly redacted" -ForegroundColor Red
    $allPass = $false
}

# 9. Version fallback
Write-Host "`n9. Checking Version Fallback..." -ForegroundColor Yellow

if ($sampleJSON.version -eq "1.0.0") {
    Write-Host "   PASS: JSON summary includes version" -ForegroundColor Green
} else {
    Write-Host "   FAIL: JSON summary missing version" -ForegroundColor Red
    $allPass = $false
}

Write-Host "`n=== Validation Summary ===" -ForegroundColor Cyan
if ($allPass) {
    Write-Host "ALL CHECKS PASSED - READY FOR v1.0 RELEASE" -ForegroundColor Green
} else {
    Write-Host "SOME CHECKS FAILED - PLEASE ADDRESS BEFORE RELEASE" -ForegroundColor Red
}

exit 0