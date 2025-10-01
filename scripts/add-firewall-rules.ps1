#Requires -RunAsAdministrator
# Mobius Firewall Rules - Add Script
# Admin-only, idempotent firewall rule creation for Mobius development
# Usage: .\scripts\add-firewall-rules.ps1 [-DryRun]

param(
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Mobius Firewall Rules - Add" -ForegroundColor Cyan
if ($DryRun) {
    Write-Host "(DRY RUN MODE - No changes will be made)" -ForegroundColor Yellow
}
Write-Host "========================================`n" -ForegroundColor Cyan

# Function to add or update a firewall rule
function Add-MobiusFirewallRule {
    param(
        [string]$Name,
        [string]$DisplayName,
        [string]$Direction,
        [string]$Action,
        [string]$Protocol,
        [string]$LocalPort = $null,
        [string]$Program = $null,
        [string]$Description
    )
    
    # Check if rule already exists
    $existingRule = Get-NetFirewallRule -DisplayName $DisplayName -ErrorAction SilentlyContinue
    
    if ($existingRule) {
        if ($DryRun) {
            Write-Host "[DRY RUN] Rule already exists: $DisplayName" -ForegroundColor Yellow
        } else {
            Write-Host "Rule already exists: $DisplayName (Skipping)" -ForegroundColor Yellow
        }
        return $false
    }
    
    if ($DryRun) {
        Write-Host "[DRY RUN] Would create rule: $DisplayName" -ForegroundColor Cyan
        Write-Host "  Direction: $Direction" -ForegroundColor Gray
        Write-Host "  Action: $Action" -ForegroundColor Gray
        Write-Host "  Protocol: $Protocol" -ForegroundColor Gray
        if ($LocalPort) {
            Write-Host "  Port: $LocalPort" -ForegroundColor Gray
        }
        if ($Program) {
            Write-Host "  Program: $Program" -ForegroundColor Gray
        }
        Write-Host "  Description: $Description" -ForegroundColor Gray
        return $true
    }
    
    try {
        $params = @{
            DisplayName = $DisplayName
            Direction = $Direction
            Action = $Action
            Protocol = $Protocol
            Description = $Description
            Enabled = "True"
            Profile = "Domain,Private,Public"
        }
        
        if ($LocalPort) {
            $params.LocalPort = $LocalPort
        }
        
        if ($Program) {
            $params.Program = $Program
        }
        
        New-NetFirewallRule @params | Out-Null
        Write-Host "Created rule: $DisplayName" -ForegroundColor Green
        return $true
    } catch {
        Write-Host "Failed to create rule: $DisplayName" -ForegroundColor Red
        Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

# Function to find Docker Desktop executable
function Find-DockerDesktop {
    $possiblePaths = @(
        "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe",
        "${env:ProgramFiles(x86)}\Docker\Docker\Docker Desktop.exe",
        "$env:LOCALAPPDATA\Docker\Docker Desktop.exe"
    )
    
    foreach ($path in $possiblePaths) {
        if (Test-Path $path) {
            return $path
        }
    }
    
    return $null
}

Write-Host "Preparing to add Mobius firewall rules...`n" -ForegroundColor Cyan

$rulesAdded = 0
$rulesSkipped = 0

# Rule 1: Mobius API Inbound (TCP 5001)
Write-Host "--- Rule 1: Mobius API Inbound (TCP 5001) ---" -ForegroundColor Cyan
$result = Add-MobiusFirewallRule `
    -Name "Mobius-API-Inbound-5001" `
    -DisplayName "Mobius API Inbound (TCP 5001)" `
    -Direction "Inbound" `
    -Action "Allow" `
    -Protocol "TCP" `
    -LocalPort "5001" `
    -Description "Allow inbound TCP connections to Mobius API on port 5001 for local development"

if ($result) { $rulesAdded++ } else { $rulesSkipped++ }
Write-Host ""

# Rule 2: Docker Desktop Program Rules (if found)
Write-Host "--- Rule 2: Docker Desktop Program Rules ---" -ForegroundColor Cyan
$dockerPath = Find-DockerDesktop

if ($dockerPath) {
    Write-Host "Docker Desktop found at: $dockerPath" -ForegroundColor Green
    
    # Inbound rule for Docker Desktop
    $result = Add-MobiusFirewallRule `
        -Name "Mobius-Docker-Desktop-Inbound" `
        -DisplayName "Mobius - Docker Desktop (Inbound)" `
        -Direction "Inbound" `
        -Action "Allow" `
        -Protocol "TCP" `
        -Program $dockerPath `
        -Description "Allow inbound connections for Docker Desktop used by Mobius"
    
    if ($result) { $rulesAdded++ } else { $rulesSkipped++ }
    
    # Outbound rule for Docker Desktop
    $result = Add-MobiusFirewallRule `
        -Name "Mobius-Docker-Desktop-Outbound" `
        -DisplayName "Mobius - Docker Desktop (Outbound)" `
        -Direction "Outbound" `
        -Action "Allow" `
        -Protocol "TCP" `
        -Program $dockerPath `
        -Description "Allow outbound connections for Docker Desktop used by Mobius"
    
    if ($result) { $rulesAdded++ } else { $rulesSkipped++ }
} else {
    Write-Host "Docker Desktop not found - skipping Docker program rules" -ForegroundColor Yellow
    Write-Host "If Docker Desktop is installed in a non-standard location, you may need to add rules manually" -ForegroundColor Yellow
}
Write-Host ""

# Rule 3: WSL Outbound HTTP (Port 80)
Write-Host "--- Rule 3: WSL Outbound HTTP (Port 80) ---" -ForegroundColor Cyan
$result = Add-MobiusFirewallRule `
    -Name "Mobius-WSL-HTTP-Outbound" `
    -DisplayName "Mobius - WSL HTTP Outbound (Port 80)" `
    -Direction "Outbound" `
    -Action "Allow" `
    -Protocol "TCP" `
    -LocalPort "80" `
    -Description "Allow WSL outbound HTTP connections for Mobius package downloads"

if ($result) { $rulesAdded++ } else { $rulesSkipped++ }
Write-Host ""

# Rule 4: WSL Outbound HTTPS (Port 443)
Write-Host "--- Rule 4: WSL Outbound HTTPS (Port 443) ---" -ForegroundColor Cyan
$result = Add-MobiusFirewallRule `
    -Name "Mobius-WSL-HTTPS-Outbound" `
    -DisplayName "Mobius - WSL HTTPS Outbound (Port 443)" `
    -Direction "Outbound" `
    -Action "Allow" `
    -Protocol "TCP" `
    -LocalPort "443" `
    -Description "Allow WSL outbound HTTPS connections for Mobius package downloads"

if ($result) { $rulesAdded++ } else { $rulesSkipped++ }
Write-Host ""

# Summary
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Summary" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

if ($DryRun) {
    Write-Host "DRY RUN COMPLETE - No changes were made" -ForegroundColor Yellow
    Write-Host "Rules that would be created: $rulesAdded" -ForegroundColor Cyan
    Write-Host "Rules that already exist: $rulesSkipped" -ForegroundColor Cyan
    Write-Host "`nTo apply these changes, run:" -ForegroundColor Yellow
    Write-Host "  .\scripts\add-firewall-rules.ps1" -ForegroundColor White
} else {
    Write-Host "Rules added: $rulesAdded" -ForegroundColor Green
    Write-Host "Rules skipped (already exist): $rulesSkipped" -ForegroundColor Yellow
    
    if ($rulesAdded -gt 0) {
        Write-Host "`nNext steps:" -ForegroundColor Cyan
        Write-Host "  1. Restart Docker Desktop" -ForegroundColor Yellow
        Write-Host "  2. Re-run your Mobius bootstrap" -ForegroundColor Yellow
        Write-Host "  3. If issues persist, run: .\scripts\diagnose-network.ps1" -ForegroundColor Yellow
    }
    
    Write-Host "`nTo remove these rules later, run:" -ForegroundColor Cyan
    Write-Host "  .\scripts\remove-firewall-rules.ps1" -ForegroundColor White
}

Write-Host "`nFor more information, see: scripts/FIREWALL-README.md`n" -ForegroundColor Cyan
