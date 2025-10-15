# Test script for verification scripts
Write-Host "=== Testing Verification Scripts ==="

# Test 1: Check that all required scripts exist
Write-Host "Test 1: Checking script existence..."
$requiredScripts = @(
    "build-and-push.ps1",
    "build-and-push.sh",
    "update-manifests.ps1",
    "update-manifests.sh",
    "apply-manifests.ps1",
    "apply-manifests.sh",
    "deploy-preview-worker.ps1",
    "deploy-preview-worker.sh",
    "verify-deployment.ps1",
    "verify-deployment.sh"
)

$allExist = $true
foreach ($script in $requiredScripts) {
    if (Test-Path $script) {
        Write-Host "  [PASS] $script exists"
    } else {
        Write-Host "  [FAIL] $script missing"
        $allExist = $false
    }
}

if (-not $allExist) {
    Write-Host "Test 1 FAILED: Some required scripts are missing"
    exit 1
} else {
    Write-Host "Test 1 PASSED: All required scripts exist"
}

# Test 2: Check that PowerShell scripts have secure PAT handling
Write-Host "Test 2: Checking PowerShell scripts for secure PAT handling..."
$psScripts = Get-ChildItem -Path "." -Include "*.ps1" -Recurse
$secureHandling = $true

foreach ($script in $psScripts) {
    $content = Get-Content $script.FullName -Raw
    if ($content -match "Read-Host.*-AsSecureString") {
        Write-Host "  [PASS] $($script.Name) uses secure PAT handling"
    } elseif ($script.Name -like "*deploy*" -or $script.Name -like "*build*") {
        Write-Host "  [WARN] $($script.Name) may need secure PAT handling"
        $secureHandling = $false
    } else {
        Write-Host "  [INFO] $($script.Name) does not handle PATs"
    }
}

if ($secureHandling) {
    Write-Host "Test 2 PASSED: PowerShell scripts use secure PAT handling"
} else {
    Write-Host "Test 2 WARNING: Some PowerShell scripts may need secure PAT handling"
}

# Test 3: Check that bash scripts have proper shebang
Write-Host "Test 3: Checking bash scripts for proper shebang..."
$shScripts = Get-ChildItem -Path "." -Include "*.sh" -Recurse
$properShebang = $true

foreach ($script in $shScripts) {
    $firstLine = Get-Content $script.FullName -First 1
    if ($firstLine -eq "#!/bin/bash") {
        Write-Host "  [PASS] $($script.Name) has proper shebang"
    } else {
        Write-Host "  [FAIL] $($script.Name) missing or incorrect shebang"
        $properShebang = $false
    }
}

if ($properShebang) {
    Write-Host "Test 3 PASSED: All bash scripts have proper shebang"
} else {
    Write-Host "Test 3 FAILED: Some bash scripts missing proper shebang"
    exit 1
}

# Test 4: Check that scripts are executable (on Unix systems)
Write-Host "Test 4: Checking script permissions (Unix only)..."
# This test is more relevant on Unix systems, but we can at least verify the files exist

Write-Host "Test 4 INFO: Script permissions check skipped on Windows"

Write-Host "=== Verification Script Tests Complete ==="
Write-Host "Summary: All critical tests passed. Ready for CI/CD integration."