# Mobius Firewall Rules - Add Script
# This script adds minimal Windows Firewall rules needed for Mobius to work with Docker and WSL
# Run this script in an elevated PowerShell (Administrator)

Write-Host "=== Adding Mobius Firewall Rules ===" -ForegroundColor Cyan
Write-Host ""

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "ERROR: This script must be run as Administrator!" -ForegroundColor Red
    Write-Host "Right-click PowerShell and select 'Run as Administrator', then try again." -ForegroundColor Yellow
    exit 1
}

Write-Host "Running as Administrator ✓" -ForegroundColor Green
Write-Host ""

# Function to add or update a firewall rule
function Add-MobiusFirewallRule {
    param(
        [string]$DisplayName,
        [string]$Description,
        [hashtable]$RuleParams
    )
    
    try {
        # Check if rule already exists
        $existingRule = Get-NetFirewallRule -DisplayName $DisplayName -ErrorAction SilentlyContinue
        
        if ($existingRule) {
            Write-Host "   ⚠ Rule already exists: $DisplayName" -ForegroundColor Yellow
            Write-Host "     Removing old rule and adding new one..." -ForegroundColor Yellow
            Remove-NetFirewallRule -DisplayName $DisplayName -ErrorAction SilentlyContinue
        }
        
        # Add the rule
        $params = @{
            DisplayName = $DisplayName
            Description = $Description
        }
        $params += $RuleParams
        
        New-NetFirewallRule @params | Out-Null
        Write-Host "   ✓ Added: $DisplayName" -ForegroundColor Green
        return $true
    } catch {
        Write-Host "   ✗ Failed to add: $DisplayName" -ForegroundColor Red
        Write-Host "     Error: $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

# Rule 1: Allow inbound TCP 5001 (Mobius API)
Write-Host "1. Adding Mobius API rule (TCP port 5001)..." -ForegroundColor Green
$success1 = Add-MobiusFirewallRule `
    -DisplayName "Mobius API (TCP 5001) - allow inbound" `
    -Description "Allows inbound connections to the Mobius API server on port 5001" `
    -RuleParams @{
        Direction = "Inbound"
        LocalPort = 5001
        Protocol = "TCP"
        Action = "Allow"
        Profile = @("Domain", "Private", "Public")
        Enabled = "True"
    }
Write-Host ""

# Rule 2: Allow Docker Desktop outbound
Write-Host "2. Adding Docker Desktop rules..." -ForegroundColor Green

$dockerPath = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
if (Test-Path $dockerPath) {
    $success2a = Add-MobiusFirewallRule `
        -DisplayName "Docker Desktop (allow)" `
        -Description "Allows Docker Desktop outbound connections" `
        -RuleParams @{
            Program = $dockerPath
            Direction = "Outbound"
            Action = "Allow"
            Profile = @("Domain", "Private", "Public")
            Enabled = "True"
        }
    
    $success2b = Add-MobiusFirewallRule `
        -DisplayName "Docker Desktop (allow inbound)" `
        -Description "Allows Docker Desktop inbound connections" `
        -RuleParams @{
            Program = $dockerPath
            Direction = "Inbound"
            Action = "Allow"
            Profile = @("Domain", "Private", "Public")
            Enabled = "True"
        }
} else {
    Write-Host "   ⚠ Docker Desktop not found at: $dockerPath" -ForegroundColor Yellow
    Write-Host "     Skipping Docker Desktop rules" -ForegroundColor Yellow
    $success2a = $true
    $success2b = $true
}
Write-Host ""

# Rule 3: Allow WSL outbound HTTP
Write-Host "3. Adding WSL HTTP/HTTPS rules..." -ForegroundColor Green
$success3a = Add-MobiusFirewallRule `
    -DisplayName "WSL Allow Outbound HTTP" `
    -Description "Allows WSL outbound HTTP connections (port 80)" `
    -RuleParams @{
        Direction = "Outbound"
        Protocol = "TCP"
        RemotePort = 80
        Action = "Allow"
        Profile = @("Domain", "Private", "Public")
        Enabled = "True"
    }

$success3b = Add-MobiusFirewallRule `
    -DisplayName "WSL Allow Outbound HTTPS" `
    -Description "Allows WSL outbound HTTPS connections (port 443)" `
    -RuleParams @{
        Direction = "Outbound"
        Protocol = "TCP"
        RemotePort = 443
        Action = "Allow"
        Profile = @("Domain", "Private", "Public")
        Enabled = "True"
    }
Write-Host ""

# Summary
Write-Host "=== Summary ===" -ForegroundColor Cyan
$totalRules = 5
$successCount = @($success1, $success2a, $success2b, $success3a, $success3b) | Where-Object { $_ -eq $true } | Measure-Object | Select-Object -ExpandProperty Count

if ($successCount -eq $totalRules) {
    Write-Host "✓ All $totalRules firewall rules added successfully!" -ForegroundColor Green
} else {
    Write-Host "⚠ Added $successCount out of $totalRules rules" -ForegroundColor Yellow
    Write-Host "  Some rules may have failed - check the output above" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Restart Docker Desktop if it's running" -ForegroundColor White
Write-Host "2. Run your bootstrap script or docker compose commands" -ForegroundColor White
Write-Host "3. To verify rules were added, run: .\scripts\diagnose-network.ps1" -ForegroundColor White
Write-Host "4. To remove these rules later, run: .\scripts\remove-firewall-rules.ps1" -ForegroundColor White
Write-Host ""
