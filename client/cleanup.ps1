# Cleanup Script for fetchJson Implementation Validation
# This script removes all validation-related files and restores the environment

Write-Host "=== Cleanup fetchJson Implementation Validation ===" -ForegroundColor Green
Write-Host ""

# Confirm with user before proceeding
Write-Host "This script will remove all validation-related files and restore the environment." -ForegroundColor Yellow
Write-Host "Do you want to proceed? (y/N)" -ForegroundColor Yellow
$confirmation = Read-Host
if ($confirmation -ne 'y' -and $confirmation -ne 'Y') {
    Write-Host "Cleanup cancelled." -ForegroundColor Yellow
    exit 0
}

# Remove validation files
Write-Host "1. Removing validation files..." -ForegroundColor Yellow
$validationFiles = @(
    "VALIDATION_STEPS.md",
    "MIGRATION_EXAMPLE.md",
    "IMPLEMENTATION_SUMMARY.md",
    "validation.ps1",
    "validation.sh",
    "VALIDATION_README.md",
    "FINAL_SUMMARY.md",
    "final_validation.ps1",
    "final_validation.sh",
    "cleanup.ps1"
)

foreach ($file in $validationFiles) {
    if (Test-Path $file) {
        Remove-Item $file -Force
        Write-Host "   ✓ Removed $file" -ForegroundColor Green
    } else {
        Write-Host "   ! $file not found" -ForegroundColor Yellow
    }
}

# Remove DevTestPage component
Write-Host "2. Removing DevTestPage component..." -ForegroundColor Yellow
if (Test-Path "src/components/DevTestPage.jsx") {
    Remove-Item "src/components/DevTestPage.jsx" -Force
    Write-Host "   ✓ Removed src/components/DevTestPage.jsx" -ForegroundColor Green
} else {
    Write-Host "   ! src/components/DevTestPage.jsx not found" -ForegroundColor Yellow
}

# Restore index.js to original state
Write-Host "3. Restoring index.js to original state..." -ForegroundColor Yellow
$indexContent = Get-Content -Path "src/index.js" -ErrorAction SilentlyContinue
if ($indexContent -match "DevTestPage") {
    # Remove the DevTestPage import and conditional rendering
    $newContent = $indexContent | Where-Object { $_ -notmatch "DevTestPage" }
    $newContent = $newContent | Where-Object { $_ -notmatch "REACT_APP_SHOW_DEV_TEST" }
    
    # Restore original App rendering
    $newContent = $newContent -replace "const app = \(.*?\);", "const app = (
  <ToastProvider>
    <App />
  </ToastProvider>
);"
    
    # Write the modified content back to the file
    $newContent | Set-Content -Path "src/index.js"
    Write-Host "   ✓ Restored src/index.js to original state" -ForegroundColor Green
} else {
    Write-Host "   ! src/index.js already in original state" -ForegroundColor Yellow
}

# Update .env file
Write-Host "4. Updating .env file..." -ForegroundColor Yellow
$envContent = Get-Content -Path ".env" -ErrorAction SilentlyContinue
$newEnvContent = @()
foreach ($line in $envContent) {
    if ($line -notmatch "REACT_APP_SHOW_DEV_TEST") {
        $newEnvContent += $line
    }
}
$newEnvContent | Set-Content -Path ".env"
Write-Host "   ✓ Removed REACT_APP_SHOW_DEV_TEST from .env" -ForegroundColor Green

Write-Host ""
Write-Host "=== Cleanup Complete ===" -ForegroundColor Green
Write-Host "All validation files have been removed and the environment has been restored." -ForegroundColor Green
Write-Host "To verify the cleanup, please restart your development server." -ForegroundColor Yellow