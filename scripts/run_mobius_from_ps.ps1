<#
.SYNOPSIS
    PowerShell wrapper to invoke MOBIUS WSL bootstrap script

.DESCRIPTION
    This script launches the WSL bootstrap script from Windows PowerShell,
    handling path conversions and validation.

.PARAMETER RepoPath
    Path to the MOBIUS repository (optional). If not provided, uses current directory.

.EXAMPLE
    .\scripts\run_mobius_from_ps.ps1 -RepoPath (pwd).Path

.EXAMPLE
    .\scripts\run_mobius_from_ps.ps1

.NOTES
    Requires:
    - WSL2 installed and configured
    - Docker Desktop with WSL2 integration
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory=$false)]
    [string]$RepoPath = (Get-Location).Path
)

# Colors for output
function Write-ColorOutput {
    param(
        [Parameter(Mandatory=$true)]
        [string]$Message,
        
        [Parameter(Mandatory=$false)]
        [ValidateSet('Info', 'Success', 'Warning', 'Error')]
        [string]$Type = 'Info'
    )
    
    $color = switch ($Type) {
        'Info'    { 'Cyan' }
        'Success' { 'Green' }
        'Warning' { 'Yellow' }
        'Error'   { 'Red' }
    }
    
    Write-Host "[$Type] " -ForegroundColor $color -NoNewline
    Write-Host $Message
}

# Check if WSL is installed
function Test-WSL {
    try {
        $wslCheck = wsl --list --verbose 2>&1
        if ($LASTEXITCODE -ne 0) {
            return $false
        }
        return $true
    }
    catch {
        return $false
    }
}

# Convert Windows path to WSL path
function ConvertTo-WSLPath {
    param([string]$WindowsPath)
    
    # Normalize path
    $normalizedPath = $WindowsPath -replace '\\', '/'
    
    # Convert drive letter (C:\ -> /mnt/c/)
    if ($normalizedPath -match '^([A-Za-z]):(.*)$') {
        $drive = $Matches[1].ToLower()
        $path = $Matches[2]
        return "/mnt/$drive$path"
    }
    
    return $normalizedPath
}

# Main execution
function Main {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "  MOBIUS PowerShell WSL Wrapper" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    
    # Check WSL
    Write-ColorOutput "Checking WSL installation..." -Type Info
    if (-not (Test-WSL)) {
        Write-ColorOutput "WSL is not installed or not configured properly." -Type Error
        Write-ColorOutput "Please run: wsl --install" -Type Error
        Write-ColorOutput "See: https://docs.microsoft.com/en-us/windows/wsl/install" -Type Error
        exit 1
    }
    Write-ColorOutput "WSL is installed" -Type Success
    
    # Check Docker
    Write-ColorOutput "Checking Docker..." -Type Info
    try {
        $dockerCheck = docker --version 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "Docker not accessible"
        }
        Write-ColorOutput "Docker is available: $dockerCheck" -Type Success
    }
    catch {
        Write-ColorOutput "Docker is not accessible from PowerShell." -Type Error
        Write-ColorOutput "Ensure Docker Desktop is running with WSL2 integration." -Type Error
        exit 1
    }
    
    # Determine script location
    Write-ColorOutput "Locating bootstrap script..." -Type Info
    
    $scriptPath = Join-Path $RepoPath "scripts\run_mobius_wsl.sh"
    
    if (Test-Path $scriptPath) {
        Write-ColorOutput "Found bootstrap script at: $scriptPath" -Type Success
        
        # Convert to WSL path
        $wslScriptPath = ConvertTo-WSLPath $scriptPath
        Write-ColorOutput "WSL path: $wslScriptPath" -Type Info
        
        # Make executable and run from repo directory
        $repoWSLPath = ConvertTo-WSLPath $RepoPath
        Write-ColorOutput "Launching WSL bootstrap..." -Type Info
        Write-Host ""
        
        # Execute in WSL
        & wsl bash -c "cd '$repoWSLPath' && chmod +x scripts/run_mobius_wsl.sh && bash scripts/run_mobius_wsl.sh"
        
        $exitCode = $LASTEXITCODE
        
        Write-Host ""
        if ($exitCode -eq 0) {
            Write-ColorOutput "Bootstrap completed successfully!" -Type Success
        }
        else {
            Write-ColorOutput "Bootstrap failed with exit code: $exitCode" -Type Error
            Write-ColorOutput "Check the output above for errors." -Type Error
        }
        
        exit $exitCode
    }
    else {
        Write-ColorOutput "Bootstrap script not found at: $scriptPath" -Type Warning
        Write-ColorOutput "Downloading from GitHub..." -Type Info
        
        # Download and run
        $downloadCmd = @"
cd ~ && \
curl -fsSL https://raw.githubusercontent.com/w9bikze8u4cbupc/MOBIUS/main/scripts/run_mobius_wsl.sh -o run_mobius_wsl.sh && \
chmod +x run_mobius_wsl.sh && \
bash run_mobius_wsl.sh
"@
        
        Write-Host ""
        & wsl bash -c $downloadCmd
        
        $exitCode = $LASTEXITCODE
        
        Write-Host ""
        if ($exitCode -eq 0) {
            Write-ColorOutput "Bootstrap completed successfully!" -Type Success
            Write-ColorOutput "Repository is available at: \\wsl$\Ubuntu\home\<username>\MOBIUS" -Type Info
        }
        else {
            Write-ColorOutput "Bootstrap failed with exit code: $exitCode" -Type Error
        }
        
        exit $exitCode
    }
}

# Error handling
trap {
    Write-ColorOutput "An error occurred: $_" -Type Error
    exit 1
}

# Run main
Main
