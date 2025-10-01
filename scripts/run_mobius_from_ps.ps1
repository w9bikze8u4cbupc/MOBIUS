# PowerShell wrapper for running MOBIUS WSL setup script
# This script invokes the WSL bootstrap script from Windows PowerShell

# Check if WSL is available
if (!(Get-Command wsl -ErrorAction SilentlyContinue)) {
    Write-Error "WSL is not installed or not in PATH. Please install WSL2 first."
    Write-Host "Visit: https://docs.microsoft.com/en-us/windows/wsl/install"
    exit 1
}

Write-Host "Starting MOBIUS setup in WSL..." -ForegroundColor Green

# Option 1: Run from WSL home directory
# Assumes run_mobius_wsl.sh is saved at ~/run_mobius_wsl.sh in WSL
wsl bash -lc "bash ~/run_mobius_wsl.sh"

# Option 2: Run from current Windows directory (commented out by default)
# Uncomment the lines below to run from your current Windows repo location
# $winRepoPath = $PWD.Path
# $wslPath = wsl wslpath -u $winRepoPath
# wsl bash -lc "cd '$wslPath' && bash ./scripts/run_mobius_wsl.sh"
