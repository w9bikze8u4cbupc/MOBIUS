# MOBIUS Games Tutorial Generator - Mock Deployment Script (PowerShell)
# Cross-platform deployment testing infrastructure
#
# Usage:
#   .\deploy-wrapper.ps1 [OPTIONS]
#
# Parameters:
#   -DryRun             Run without actual deployment (safe mode)
#   -Verbose            Enable detailed logging
#   -Debug              Enable debug output  
#   -InputPath PATH     Specify input video file path
#   -OutputDir DIR      Specify output directory
#   -GameName NAME      Game name for deployment
#   -Platform PLATFORM  Override platform detection (windows|linux|macos)
#   -SimulateError      Simulate deployment errors for testing
#   -Help               Show help message

[CmdletBinding()]
param(
    [switch]$DryRun = $false,
    [switch]$VerboseOutput = $false,
    [switch]$DebugOutput = $false,
    [string]$InputPath = "out/preview.mp4",
    [string]$OutputDir = "deploy",
    [string]$GameName = "",
    [string]$Platform = "",
    [switch]$SimulateError = $false,
    [switch]$Help = $false
)

# Enable verbose output if Debug is set
if ($DebugOutput) { $VerboseOutput = $true }

# Color functions for better output
function Write-ColorOutput {
    param(
        [string]$Message,
        [string]$Color = "White"
    )
    
    $colors = @{
        "Red" = [ConsoleColor]::Red
        "Green" = [ConsoleColor]::Green  
        "Yellow" = [ConsoleColor]::Yellow
        "Blue" = [ConsoleColor]::Blue
        "White" = [ConsoleColor]::White
    }
    
    Write-Host $Message -ForegroundColor $colors[$Color]
}

# Logging functions
function Log-Info {
    param([string]$Message)
    Write-ColorOutput "[INFO] $Message" "Blue"
}

function Log-Success {
    param([string]$Message)
    Write-ColorOutput "[SUCCESS] $Message" "Green"
}

function Log-Warning {
    param([string]$Message)
    Write-ColorOutput "[WARNING] $Message" "Yellow"
}

function Log-Error {
    param([string]$Message)
    Write-ColorOutput "[ERROR] $Message" "Red"
}

function Log-Debug {
    param([string]$Message)
    if ($DebugOutput) {
        Write-Host "[DEBUG] $Message" -ForegroundColor Gray
    }
}

function Log-Verbose {
    param([string]$Message)
    if ($VerboseOutput -or $DebugOutput) {
        Write-Host "[VERBOSE] $Message" -ForegroundColor Cyan
    }
}

# Platform detection
function Get-Platform {
    if (-not [string]::IsNullOrEmpty($Platform)) {
        return $Platform
    }
    
    $os = [System.Environment]::OSVersion.Platform
    switch ($os) {
        "Win32NT" { return "windows" }
        "Unix" { 
            $unameOutput = & uname -s 2>$null
            if ($unameOutput -like "*Darwin*") { return "macos" }
            else { return "linux" }
        }
        default { return "unknown" }
    }
}

# Hash calculation
function Get-FileHashSHA256 {
    param([string]$FilePath)
    
    if (-not (Test-Path $FilePath)) {
        Log-Error "File not found for hash calculation: $FilePath"
        return $null
    }
    
    try {
        $hash = Get-FileHash -Path $FilePath -Algorithm SHA256
        return $hash.Hash
    }
    catch {
        Log-Error "Failed to calculate hash for $FilePath`: $($_.Exception.Message)"
        return $null
    }
}

# File size formatting
function Format-FileSize {
    param([long]$Size)
    
    if ($Size -lt 1KB) { return "$Size bytes" }
    elseif ($Size -lt 1MB) { return "{0:N0} KB" -f ($Size / 1KB) }
    elseif ($Size -lt 1GB) { return "{0:N0} MB" -f ($Size / 1MB) }
    else { return "{0:N2} GB" -f ($Size / 1GB) }
}

# Mock deployment function
function Invoke-MockDeploy {
    param(
        [string]$InputFile,
        [string]$OutputDirectory,
        [string]$GameName
    )
    
    Log-Info "Starting mock deployment..."
    Log-Verbose "Platform: $(Get-Platform)"
    Log-Verbose "Input file: $InputFile"
    Log-Verbose "Output directory: $OutputDirectory"
    Log-Verbose "Game name: $GameName"
    
    # Check if input file exists
    if (-not (Test-Path $InputFile)) {
        Log-Error "Input file not found: $InputFile"
        return $false
    }
    
    # Get file info
    $fileInfo = Get-Item $InputFile
    $fileSize = $fileInfo.Length
    Log-Verbose "File size: $(Format-FileSize $fileSize)"
    Log-Verbose "Last modified: $($fileInfo.LastWriteTime)"
    
    # Calculate hash
    Log-Verbose "Calculating SHA256 hash..."
    $fileHash = Get-FileHashSHA256 $InputFile
    if ($null -eq $fileHash) {
        return $false
    }
    Log-Verbose "SHA256: $fileHash"
    
    # Simulate deployment steps
    if ($DryRun) {
        Log-Info "DRY RUN MODE - No actual deployment performed"
        Log-Verbose "Would create output directory: $OutputDirectory"
        Log-Verbose "Would copy file to: $OutputDirectory\$(if($GameName){$GameName}else{'preview'}).mp4"
        Log-Verbose "Would verify file integrity"
        Log-Verbose "Would send deployment notifications"
        
        # Simulate processing time
        Start-Sleep -Seconds 1
        
        if ($SimulateError) {
            Log-Error "Simulated deployment error (as requested)"
            return $false
        }
        
        Log-Success "Mock deployment completed successfully"
        return $true
    }
    
    # Actual deployment simulation (still safe)
    Log-Info "Creating output directory..."
    if (-not (Test-Path $OutputDirectory)) {
        New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
    }
    
    $outputFileName = if ($GameName) { "$GameName.mp4" } else { "preview.mp4" }
    $outputFile = Join-Path $OutputDirectory $outputFileName
    
    Log-Info "Copying file to deployment location..."
    Copy-Item $InputFile $outputFile -Force
    
    # Verify copied file
    Log-Info "Verifying file integrity..."
    $copiedHash = Get-FileHashSHA256 $outputFile
    if ($null -eq $copiedHash) {
        return $false
    }
    
    if ($fileHash -ne $copiedHash) {
        Log-Error "File integrity check failed!"
        Log-Error "Original: $fileHash"
        Log-Error "Copied:   $copiedHash"
        return $false
    }
    
    Log-Success "File integrity verified"
    Log-Success "Deployment completed successfully"
    return $true
}

# Show help
function Show-Help {
    @"
MOBIUS Mock Deployment Script (PowerShell)

Usage: .\deploy-wrapper.ps1 [OPTIONS]

This script provides a safe testing environment for deployment workflows
without actually publishing content.

PARAMETERS:
    -DryRun             Run in dry-run mode (no file operations)
    -VerboseOutput      Enable verbose output
    -DebugOutput        Enable debug output
    -InputPath PATH     Input video file (default: out/preview.mp4)
    -OutputDir DIR      Output directory (default: deploy)
    -GameName NAME      Game name for deployment
    -Platform PLATFORM  Override platform detection
    -SimulateError      Simulate deployment errors
    -Help               Show this help

EXAMPLES:
    # Basic dry run
    .\deploy-wrapper.ps1 -DryRun

    # Verbose dry run with custom input
    .\deploy-wrapper.ps1 -DryRun -VerboseOutput -InputPath "out\my-game.mp4"

    # Test error handling
    .\deploy-wrapper.ps1 -DryRun -SimulateError

    # Hash verification
    .\deploy-wrapper.ps1 -DryRun -VerboseOutput
    Get-FileHash "out\preview.mp4" -Algorithm SHA256

PLATFORM SUPPORT:
    - Windows PowerShell (native)
    - Windows PowerShell Core
    - Cross-platform hash verification

"@ | Write-Host
}

# Main execution
function Main {
    $startTime = Get-Date
    
    # Show help if requested
    if ($Help) {
        Show-Help
        return
    }
    
    Log-Info "MOBIUS Mock Deployment Script (PowerShell)"
    Log-Debug "Script started at $startTime"
    Log-Debug "Arguments: DryRun=$DryRun, VerboseOutput=$VerboseOutput, DebugOutput=$DebugOutput"
    Log-Debug "Input: $InputPath, Output: $OutputDir, Game: $GameName"
    
    try {
        # Run mock deployment
        if (Invoke-MockDeploy $InputPath $OutputDir $GameName) {
            $endTime = Get-Date
            $duration = ($endTime - $startTime).TotalSeconds
            Log-Success "Mock deployment completed in $([math]::Round($duration, 1))s"
            
            # Call notification mock if available
            $notifyScript = "scripts\deploy\notify-mock.ps1"
            if (Test-Path $notifyScript) {
                Log-Verbose "Sending deployment notification..."
                & ".\$notifyScript" -DryRun -Message "Deployment completed: $GameName"
            }
            
            exit 0
        }
        else {
            Log-Error "Mock deployment failed"
            exit 1
        }
    }
    catch {
        Log-Error "Unexpected error: $($_.Exception.Message)"
        Log-Debug "Full exception: $($_.Exception | Format-List * | Out-String)"
        exit 1
    }
}

# Execute main function
Main