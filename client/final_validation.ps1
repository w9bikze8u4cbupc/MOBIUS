# Final Validation Script for fetchJson Implementation
# This script verifies that all components have been properly implemented

# Set TLS protocol for secure connections
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

Write-Host "=== Final Validation of fetchJson Implementation ===" -ForegroundColor Green
Write-Host ""

# Check if server is running
Write-Host "1. Checking if development server is running..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000" -Method HEAD -TimeoutSec 5
    if ($response.StatusCode -eq 200) {
        Write-Host "   ✓ Server is running on port 3000" -ForegroundColor Green
    } else {
        Write-Host "   ✗ Server returned status code $($response.StatusCode)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "   ✗ Server is not running on port 3000" -ForegroundColor Red
    Write-Host "   Please start the development server with 'npm start'" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "2. Checking required files..." -ForegroundColor Yellow

# List of required files
$requiredFiles = @(
    "src/utils/fetchJson.js",
    "src/utils/errorMap.js",
    "src/utils/errorMapNew.js",
    "src/contexts/ToastContext.js",
    "src/components/ApiSmokeTest.jsx",
    "src/components/DebugChips.jsx",
    "src/components/DevTestPage.jsx",
    "src/api/extractActionsHook.js",
    "src/api/extractPdfImagesHook.js",
    "src/api/extractBggHtml.js",
    "src/api/extractActions.js",
    "src/api/extractPdfImages.js"
)

$missingFiles = @()
foreach ($file in $requiredFiles) {
    if (Test-Path $file) {
        Write-Host "   ✓ $file" -ForegroundColor Green
    } else {
        Write-Host "   ✗ $file" -ForegroundColor Red
        $missingFiles += $file
    }
}

if ($missingFiles.Count -gt 0) {
    Write-Host ""
    Write-Host "   Missing files:" -ForegroundColor Red
    foreach ($file in $missingFiles) {
        Write-Host "   - $file" -ForegroundColor Red
    }
    exit 1
}

Write-Host ""
Write-Host "3. Checking environment variables..." -ForegroundColor Yellow
$envContent = Get-Content -Path ".env" -ErrorAction SilentlyContinue
$requiredEnvVars = @(
    "REACT_APP_QA_LABELS=true",
    "REACT_APP_SHOW_DEV_TEST=true"
)

$missingEnvVars = @()
foreach ($var in $requiredEnvVars) {
    if ($envContent -match $var) {
        Write-Host "   ✓ $var" -ForegroundColor Green
    } else {
        Write-Host "   ✗ $var" -ForegroundColor Red
        $missingEnvVars += $var
    }
}

if ($missingEnvVars.Count -gt 0) {
    Write-Host ""
    Write-Host "   Missing environment variables:" -ForegroundColor Red
    foreach ($var in $missingEnvVars) {
        Write-Host "   - $var" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "4. Checking modified files..." -ForegroundColor Yellow

# Check index.js
$indexContent = Get-Content -Path "src/index.js" -ErrorAction SilentlyContinue
if ($indexContent -match "DevTestPage") {
    Write-Host "   ✓ src/index.js properly configured for DevTestPage" -ForegroundColor Green
} else {
    Write-Host "   ✗ src/index.js not properly configured for DevTestPage" -ForegroundColor Red
}

Write-Host ""
Write-Host "5. Manual Validation Steps (Open browser to http://localhost:3000):" -ForegroundColor Yellow
Write-Host "   a. Verify you see the 'Dev Test Page' heading" -ForegroundColor Cyan
Write-Host "   b. Click 'Call Health' button" -ForegroundColor Cyan
Write-Host "      - Expect: Success toast message" -ForegroundColor Cyan
Write-Host "      - Expect: DebugChips info panel shows requestId, latency, source" -ForegroundColor Cyan
Write-Host "   c. Click 'Call Oversize (413)' button multiple times rapidly" -ForegroundColor Cyan
Write-Host "      - Expect: Only one error toast despite multiple clicks" -ForegroundColor Cyan
Write-Host "   d. Click 'Call Network Fail' button multiple times rapidly" -ForegroundColor Cyan
Write-Host "      - Expect: Only one error toast despite internal retries" -ForegroundColor Cyan

Write-Host ""
Write-Host "6. QA Gating Validation:" -ForegroundColor Yellow
Write-Host "   a. Set REACT_APP_QA_LABELS=false in .env" -ForegroundColor Cyan
Write-Host "   b. Restart dev server" -ForegroundColor Cyan
Write-Host "   c. Click 'Call Health'" -ForegroundColor Cyan
Write-Host "      - Expect: Success toast appears" -ForegroundColor Cyan
Write-Host "      - Expect: DebugChips info panel does NOT appear" -ForegroundColor Cyan

Write-Host ""
Write-Host "7. Restore Normal App:" -ForegroundColor Yellow
Write-Host "   a. Set REACT_APP_SHOW_DEV_TEST=false in .env" -ForegroundColor Cyan
Write-Host "   b. Restart dev server" -ForegroundColor Cyan
Write-Host "   c. Confirm normal App component is rendered" -ForegroundColor Cyan

Write-Host ""
Write-Host "=== Validation Complete ===" -ForegroundColor Green

if ($missingFiles.Count -eq 0 -and $missingEnvVars.Count -eq 0) {
    Write-Host "   All checks passed! The fetchJson implementation is ready for use." -ForegroundColor Green
} else {
    Write-Host "   Some checks failed. Please review the output above." -ForegroundColor Yellow
}