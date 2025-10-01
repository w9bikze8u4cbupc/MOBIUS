# MOBIUS PowerShell Wrapper for WSL Bootstrap
# This script runs the WSL bootstrap from Windows PowerShell

param(
    [string]$RepoPath = ""
)

Write-Host "========================================" -ForegroundColor Blue
Write-Host "MOBIUS WSL Bootstrap Launcher" -ForegroundColor Blue
Write-Host "========================================" -ForegroundColor Blue
Write-Host ""

# Check if WSL is available
try {
    $wslVersion = wsl --status 2>&1
    Write-Host "[INFO] WSL is available" -ForegroundColor Cyan
} catch {
    Write-Host "[ERROR] WSL is not available. Please install WSL2 first." -ForegroundColor Red
    Write-Host "Run: wsl --install" -ForegroundColor Yellow
    exit 1
}

# Check if Ubuntu is installed
$distros = wsl --list --quiet
if ($distros -notcontains "Ubuntu") {
    Write-Host "[WARNING] Ubuntu distribution not found." -ForegroundColor Yellow
    Write-Host "Available distributions:" -ForegroundColor Yellow
    wsl --list
    Write-Host ""
    Write-Host "To install Ubuntu, run: wsl --install -d Ubuntu" -ForegroundColor Yellow
}

# Determine which script to run
if ($RepoPath -ne "") {
    Write-Host "[INFO] Using repo at Windows path: $RepoPath" -ForegroundColor Cyan
    
    # Convert Windows path to WSL path
    $wslPath = wsl wslpath "$RepoPath"
    Write-Host "[INFO] WSL path: $wslPath" -ForegroundColor Cyan
    Write-Host ""
    
    # Run the bootstrap script from the repo
    Write-Host "[INFO] Running bootstrap script from repository..." -ForegroundColor Cyan
    wsl bash -lc "cd '$wslPath' && bash ./scripts/run_mobius_wsl.sh"
} else {
    Write-Host "[INFO] No repo path provided." -ForegroundColor Cyan
    Write-Host "[INFO] Running WSL script from home directory (~/run_mobius_wsl.sh)" -ForegroundColor Cyan
    Write-Host ""
    
    # Check if the script exists in WSL home
    $scriptExists = wsl bash -lc "test -f ~/run_mobius_wsl.sh && echo 'exists' || echo 'missing'"
    
    if ($scriptExists -match "missing") {
        Write-Host "[INFO] Downloading bootstrap script to WSL home..." -ForegroundColor Cyan
        wsl bash -lc "curl -fsSL https://raw.githubusercontent.com/w9bikze8u4cbupc/MOBIUS/main/scripts/run_mobius_wsl.sh -o ~/run_mobius_wsl.sh && chmod +x ~/run_mobius_wsl.sh"
        
        if ($LASTEXITCODE -ne 0) {
            Write-Host "[ERROR] Failed to download bootstrap script" -ForegroundColor Red
            exit 1
        }
        
        Write-Host "[SUCCESS] Bootstrap script downloaded" -ForegroundColor Green
    }
    
    # Run the bootstrap script
    Write-Host "[INFO] Running bootstrap script..." -ForegroundColor Cyan
    wsl bash -lc "bash ~/run_mobius_wsl.sh"
}

# Check exit code
if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "Bootstrap completed successfully!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "Bootstrap encountered errors" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "Check the output above for error messages" -ForegroundColor Yellow
    exit $LASTEXITCODE
}
