# Validation script to confirm all changes have been implemented correctly

Write-Host "Validating implementation of minor nits and quick fixes..." -ForegroundColor Cyan

# 1. Check bash script help output
Write-Host "1. Checking bash script safe variable expansion..." -ForegroundColor Yellow
$bashContent = Get-Content .\mobius_golden_path.sh -Raw
if ($bashContent -match '\$\{SERVER:-http://localhost:5001\}') {
    Write-Host "   PASS: Bash script uses safe variable expansion" -ForegroundColor Green
} else {
    Write-Host "   FAIL: Bash script may not use safe variable expansion" -ForegroundColor Red
}

# 2. Check PowerShell script Profile parameter
Write-Host "2. Checking PowerShell script Profile parameter..." -ForegroundColor Yellow
$psContent = Get-Content .\mobius_golden_path.ps1 -Raw
if ($psContent -match "\[string\]\`$Profile") {
    Write-Host "   PASS: PowerShell script has Profile parameter" -ForegroundColor Green
} else {
    Write-Host "   FAIL: PowerShell script missing Profile parameter" -ForegroundColor Red
}

# 3. Check terminology consistency
Write-Host "3. Checking terminology consistency..." -ForegroundColor Yellow
# Check that PowerShell script uses "preview" instead of "timeline" in profiles
$profileSection = Select-String -Path .\mobius_golden_path.ps1 -Pattern "smoke.*preview" -Context 0,1
if ($profileSection.Line -match "preview" -and $profileSection.Line -notmatch "timeline") {
    Write-Host "   PASS: PowerShell script uses 'preview' terminology consistently" -ForegroundColor Green
} else {
    Write-Host "   WARN: Check PowerShell script for terminology consistency" -ForegroundColor Yellow
}

# 4. Check JUnit XML escaping
Write-Host "4. Checking JUnit XML escaping..." -ForegroundColor Yellow
if ($psContent -match "Replace\('<','&lt;'\)") {
    Write-Host "   PASS: PowerShell script has proper XML escaping" -ForegroundColor Green
} else {
    Write-Host "   FAIL: PowerShell script may lack proper XML escaping" -ForegroundColor Red
}

# 5. Check docs parity script
Write-Host "5. Checking docs parity script..." -ForegroundColor Yellow
$docsParityContent = Get-Content .\ci\docs-parity-check.ps1 -Raw
if ($docsParityContent -match "psParamFlags") {
    Write-Host "   PASS: Docs parity script includes PowerShell param validation" -ForegroundColor Green
} else {
    Write-Host "   FAIL: Docs parity script may lack PowerShell param validation" -ForegroundColor Red
}

# 6. Check CI workflow
Write-Host "6. Checking CI workflow..." -ForegroundColor Yellow
$ciWorkflowContent = Get-Content .\.github\workflows\ci.yml -Raw
if ($ciWorkflowContent -match "jq -e") {
    Write-Host "   PASS: CI workflow includes JSON schema validation" -ForegroundColor Green
} else {
    Write-Host "   FAIL: CI workflow may lack JSON schema validation" -ForegroundColor Red
}

# 7. Check CHANGELOG
Write-Host "7. Checking CHANGELOG..." -ForegroundColor Yellow
$changelogContent = Get-Content .\CHANGELOG.md -Raw
if ($changelogContent -match "v2.0.0") {
    Write-Host "   PASS: CHANGELOG includes deprecation window" -ForegroundColor Green
} else {
    Write-Host "   FAIL: CHANGELOG may lack deprecation window" -ForegroundColor Red
}

# 8. Check sample artifacts
Write-Host "8. Checking sample artifacts..." -ForegroundColor Yellow
if (Test-Path .\sample_artifacts\) {
    Write-Host "   PASS: Sample artifacts directory exists" -ForegroundColor Green
} else {
    Write-Host "   FAIL: Sample artifacts directory missing" -ForegroundColor Red
}

Write-Host "`nValidation complete!" -ForegroundColor Cyan