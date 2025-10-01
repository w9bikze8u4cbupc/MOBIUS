# run_mobius_from_ps.ps1 - PowerShell wrapper to invoke WSL bootstrap script
# 
# Usage:
#   .\scripts\run_mobius_from_ps.ps1 -RepoPath (pwd).Path
#   .\scripts\run_mobius_from_ps.ps1 -RepoPath "C:\Users\YourName\MOBIUS"

param(
    [Parameter(Mandatory=$false)]
    [string]$RepoPath = $PWD.Path,
    
    [Parameter(Mandatory=$false)]
    [switch]$Help
)

# Display help
if ($Help) {
    Write-Host @"
MOBIUS WSL Bootstrap - PowerShell Wrapper

Usage:
  .\scripts\run_mobius_from_ps.ps1 [-RepoPath <path>] [-Help]

Parameters:
  -RepoPath   Path to the MOBIUS repository (default: current directory)
  -Help       Display this help message

Examples:
  # Run from repository root
  .\scripts\run_mobius_from_ps.ps1

  # Specify repository path
  .\scripts\run_mobius_from_ps.ps1 -RepoPath "C:\Users\YourName\MOBIUS"

  # Run with explicit current directory
  .\scripts\run_mobius_from_ps.ps1 -RepoPath (pwd).Path

Requirements:
  - Windows 10/11 with WSL2 installed
  - Ubuntu distribution in WSL
  - Docker Desktop with WSL2 integration

For more information, see docs/WINDOWS_SETUP.md
"@
    exit 0
}

# Color functions
function Write-Info {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host "[SUCCESS] $Message" -ForegroundColor Green
}

function Write-Error-Custom {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

function Write-Warning-Custom {
    param([string]$Message)
    Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

# Main script
Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║     MOBIUS WSL2 Bootstrap - PowerShell Wrapper            ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Check if WSL is installed
Write-Info "Checking WSL installation..."
try {
    $wslVersion = wsl --version 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Success "WSL is installed"
    }
} catch {
    Write-Error-Custom "WSL is not installed or not available"
    Write-Host "Please install WSL2 by running in Administrator PowerShell:"
    Write-Host "  wsl --install"
    Write-Host ""
    Write-Host "For more information, see docs/WINDOWS_SETUP.md"
    exit 1
}

# Check if Ubuntu distribution is available
Write-Info "Checking Ubuntu distribution..."
$distributions = wsl -l -q 2>&1
if ($distributions -match "Ubuntu") {
    Write-Success "Ubuntu distribution found"
} else {
    Write-Error-Custom "Ubuntu distribution not found"
    Write-Host "Please install Ubuntu by running:"
    Write-Host "  wsl --install -d Ubuntu"
    Write-Host ""
    Write-Host "Available distributions:"
    wsl --list --online
    exit 1
}

# Check if Docker Desktop is running
Write-Info "Checking Docker Desktop..."
try {
    $dockerCheck = wsl -d Ubuntu -e docker ps 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Docker is accessible from WSL"
    } else {
        Write-Warning-Custom "Docker may not be accessible from WSL"
        Write-Host "Please ensure:"
        Write-Host "  1. Docker Desktop is running"
        Write-Host "  2. WSL2 integration is enabled in Docker Desktop settings"
        Write-Host ""
        Write-Host "Continuing anyway..."
    }
} catch {
    Write-Warning-Custom "Could not verify Docker availability"
}

# Convert Windows path to WSL path
Write-Info "Converting repository path to WSL format..."
$wslPath = $RepoPath -replace '\\', '/' -replace '^([A-Z]):', '/mnt/$1' -replace '([A-Z]):', { $_.Value.ToLower() }
Write-Info "Windows path: $RepoPath"
Write-Info "WSL path: $wslPath"

# Check if the bootstrap script exists in the repository
$scriptPath = Join-Path $RepoPath "scripts\run_mobius_wsl.sh"
if (Test-Path $scriptPath) {
    Write-Success "Bootstrap script found: $scriptPath"
    $wslScriptPath = "$wslPath/scripts/run_mobius_wsl.sh"
    
    Write-Info "Making script executable..."
    wsl -d Ubuntu -e bash -c "chmod +x '$wslScriptPath'"
    
    Write-Info "Running bootstrap script from repository..."
    Write-Host ""
    wsl -d Ubuntu -e bash -l -c "cd '$wslPath' && bash '$wslScriptPath'"
    
} else {
    Write-Warning-Custom "Bootstrap script not found in repository"
    Write-Info "Downloading and running bootstrap script from GitHub..."
    Write-Host ""
    
    # Run the bootstrap script from GitHub
    wsl -d Ubuntu -e bash -l -c @"
curl -fsSL https://raw.githubusercontent.com/w9bikze8u4cbupc/MOBIUS/main/scripts/run_mobius_wsl.sh -o ~/run_mobius_wsl.sh && \
chmod +x ~/run_mobius_wsl.sh && \
bash ~/run_mobius_wsl.sh
"@
}

# Check exit code
if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Success "Bootstrap completed successfully!"
    Write-Host ""
    Write-Info "To access your repository in WSL:"
    Write-Host "  wsl -d Ubuntu"
    Write-Host "  cd ~/MOBIUS"
    Write-Host ""
    Write-Info "Or open in VS Code:"
    Write-Host "  wsl -d Ubuntu -e code ~/MOBIUS"
    Write-Host ""
} else {
    Write-Host ""
    Write-Error-Custom "Bootstrap failed with exit code $LASTEXITCODE"
    Write-Host ""
    Write-Info "Check the output above for error messages"
    Write-Info "For troubleshooting, see docs/WINDOWS_SETUP.md"
    Write-Host ""
    exit $LASTEXITCODE
}
