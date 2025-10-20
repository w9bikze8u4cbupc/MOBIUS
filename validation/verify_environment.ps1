# Mobius Tutorial Generator - Environment Verification (PowerShell)
Write-Host "Mobius Tutorial Generator - Environment Verification" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green

# Check if required environment files exist
Write-Host "`nChecking required environment files..." -ForegroundColor Yellow
$requiredFiles = @(".env", "client\.env")
$missingFiles = @()

foreach ($file in $requiredFiles) {
    if (Test-Path $file) {
        Write-Host "✅ Found required file: $file" -ForegroundColor Green
    } else {
        $missingFiles += $file
        Write-Host "❌ Missing required file: $file" -ForegroundColor Red
    }
}

if ($missingFiles.Count -gt 0) {
    Write-Host "`n⚠️  Warning: $($missingFiles.Count) required files are missing. Please create them before proceeding." -ForegroundColor Yellow
}

# Check if required ports are available
Write-Host "`nChecking port availability..." -ForegroundColor Yellow
$backendPort = 5001
$frontendPort = 3000

function Test-Port {
    param([int]$Port)
    $result = netstat -an | findstr ":$Port "
    return $result -ne $null
}

$backendInUse = Test-Port -Port $backendPort
$frontendInUse = Test-Port -Port $frontendPort

Write-Host "Port $backendPort (Backend): $(if ($backendInUse) { 'In Use' } else { 'Free' })" -ForegroundColor $(if ($backendInUse) { 'Yellow' } else { 'Green' })
Write-Host "Port $frontendPort (Frontend): $(if ($frontendInUse) { 'In Use' } else { 'Free' })" -ForegroundColor $(if ($frontendInUse) { 'Yellow' } else { 'Green' })

# Check if required executables are available
Write-Host "`nChecking required executables..." -ForegroundColor Yellow
$requiredExecutables = @("node", "npm", "ffmpeg")

foreach ($executable in $requiredExecutables) {
    try {
        $result = Get-Command $executable -ErrorAction Stop
        Write-Host "$executable: Found" -ForegroundColor Green
    } catch {
        Write-Host "$executable: Not Found" -ForegroundColor Red
    }
}

# Summary
Write-Host "`n=== Verification Summary ===" -ForegroundColor Cyan
Write-Host "Environment verification complete." -ForegroundColor Cyan
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Start the backend server: npm run server" -ForegroundColor Cyan
Write-Host "2. Start the frontend server: npm run ui" -ForegroundColor Cyan
Write-Host "3. Verify both servers are running on their respective ports" -ForegroundColor Cyan