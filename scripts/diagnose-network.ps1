# Mobius Network Diagnostics Script
# Read-only, non-admin diagnostics for Windows Firewall and connectivity issues
# Usage: .\scripts\diagnose-network.ps1

param(
    [switch]$Verbose
)

$ErrorActionPreference = "Continue"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Mobius Network Diagnostics" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Test connectivity to critical endpoints
function Test-Connectivity {
    param(
        [string]$Target,
        [int]$Port,
        [string]$Description
    )
    
    Write-Host "Testing $Description ($Target`:$Port)... " -NoNewline
    
    try {
        $tcpClient = New-Object System.Net.Sockets.TcpClient
        $connect = $tcpClient.BeginConnect($Target, $Port, $null, $null)
        $wait = $connect.AsyncWaitHandle.WaitOne(3000, $false)
        
        if ($wait -and $tcpClient.Connected) {
            $tcpClient.Close()
            Write-Host "[OK]" -ForegroundColor Green
            return $true
        } else {
            $tcpClient.Close()
            Write-Host "[FAILED]" -ForegroundColor Red
            return $false
        }
    } catch {
        Write-Host "[FAILED]" -ForegroundColor Red
        if ($Verbose) {
            Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Yellow
        }
        return $false
    }
}

# Check Windows Firewall status
function Get-FirewallStatus {
    Write-Host "`n--- Windows Firewall Status ---" -ForegroundColor Cyan
    
    try {
        $profiles = Get-NetFirewallProfile -ErrorAction Stop
        foreach ($profile in $profiles) {
            $status = if ($profile.Enabled) { "Enabled" } else { "Disabled" }
            $color = if ($profile.Enabled) { "Yellow" } else { "Green" }
            Write-Host "  $($profile.Name) Profile: $status" -ForegroundColor $color
        }
    } catch {
        Write-Host "  Unable to retrieve firewall status (may require elevation)" -ForegroundColor Yellow
    }
}

# Check for existing Mobius firewall rules
function Get-MobiusRules {
    Write-Host "`n--- Existing Mobius Firewall Rules ---" -ForegroundColor Cyan
    
    try {
        $rules = Get-NetFirewallRule -DisplayName "Mobius*" -ErrorAction SilentlyContinue
        
        if ($rules) {
            foreach ($rule in $rules) {
                $status = if ($rule.Enabled) { "Enabled" } else { "Disabled" }
                Write-Host "  - $($rule.DisplayName): $status" -ForegroundColor Green
            }
        } else {
            Write-Host "  No Mobius firewall rules found" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "  Unable to retrieve firewall rules (may require elevation)" -ForegroundColor Yellow
    }
}

# Check if port 5001 is in use
function Test-Port5001 {
    Write-Host "`n--- Port 5001 Status ---" -ForegroundColor Cyan
    
    try {
        $connections = Get-NetTCPConnection -LocalPort 5001 -ErrorAction SilentlyContinue
        
        if ($connections) {
            Write-Host "  Port 5001 is in use:" -ForegroundColor Yellow
            foreach ($conn in $connections) {
                $process = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
                if ($process) {
                    Write-Host "    Process: $($process.Name) (PID: $($conn.OwningProcess))" -ForegroundColor Yellow
                }
            }
        } else {
            Write-Host "  Port 5001 is available" -ForegroundColor Green
        }
    } catch {
        Write-Host "  Unable to check port 5001 status" -ForegroundColor Yellow
    }
}

# Check for Docker Desktop
function Test-DockerDesktop {
    Write-Host "`n--- Docker Desktop Status ---" -ForegroundColor Cyan
    
    # Check if Docker Desktop process is running
    $dockerProcess = Get-Process -Name "Docker Desktop" -ErrorAction SilentlyContinue
    if ($dockerProcess) {
        Write-Host "  Docker Desktop is running (PID: $($dockerProcess.Id))" -ForegroundColor Green
    } else {
        Write-Host "  Docker Desktop is not running" -ForegroundColor Yellow
    }
    
    # Check if Docker daemon is accessible
    Write-Host "`n  Testing Docker daemon connectivity..." -ForegroundColor Cyan
    try {
        $dockerVersion = docker version --format '{{.Server.Version}}' 2>$null
        if ($dockerVersion) {
            Write-Host "    Docker daemon is accessible (Version: $dockerVersion)" -ForegroundColor Green
        } else {
            Write-Host "    Docker daemon is not accessible" -ForegroundColor Red
        }
    } catch {
        Write-Host "    Docker daemon is not accessible" -ForegroundColor Red
    }
    
    # Check if docker command exists
    $dockerCmd = Get-Command docker -ErrorAction SilentlyContinue
    if ($dockerCmd) {
        Write-Host "  Docker CLI is installed at: $($dockerCmd.Source)" -ForegroundColor Green
    } else {
        Write-Host "  Docker CLI not found in PATH" -ForegroundColor Yellow
    }
}

# Main execution
Write-Host "--- Connectivity Tests ---" -ForegroundColor Cyan
Write-Host ""

$githubOk = Test-Connectivity -Target "github.com" -Port 443 -Description "GitHub (HTTPS)"
$npmOk = Test-Connectivity -Target "registry.npmjs.org" -Port 443 -Description "NPM Registry (HTTPS)"
$dockerOk = Test-Connectivity -Target "registry-1.docker.io" -Port 443 -Description "Docker Registry (HTTPS)"

Get-FirewallStatus
Get-MobiusRules
Test-Port5001
Test-DockerDesktop

# Summary and recommendations
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Summary & Recommendations" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

$issues = @()

if (-not $githubOk) {
    $issues += "GitHub connectivity failed"
}
if (-not $npmOk) {
    $issues += "NPM Registry connectivity failed"
}
if (-not $dockerOk) {
    $issues += "Docker Registry connectivity failed"
}

if ($issues.Count -eq 0) {
    Write-Host "All connectivity tests passed!" -ForegroundColor Green
    Write-Host "If you're still experiencing issues, check:" -ForegroundColor Yellow
    Write-Host "  - Docker Desktop WSL integration settings" -ForegroundColor Yellow
    Write-Host "  - Corporate proxy settings" -ForegroundColor Yellow
    Write-Host "  - VPN or network restrictions" -ForegroundColor Yellow
} else {
    Write-Host "Issues detected:" -ForegroundColor Red
    foreach ($issue in $issues) {
        Write-Host "  - $issue" -ForegroundColor Red
    }
    Write-Host "`nRecommended actions:" -ForegroundColor Yellow
    Write-Host "  1. Run add-firewall-rules.ps1 with -DryRun flag (requires Admin)" -ForegroundColor Yellow
    Write-Host "  2. If DryRun looks safe, run add-firewall-rules.ps1 (requires Admin)" -ForegroundColor Yellow
    Write-Host "  3. Restart Docker Desktop after adding rules" -ForegroundColor Yellow
    Write-Host "  4. If behind corporate firewall, ask IT to whitelist required domains" -ForegroundColor Yellow
    Write-Host "     (See FIREWALL-README.md for full list)" -ForegroundColor Yellow
}

Write-Host "`nFor more information, see: scripts/FIREWALL-README.md`n" -ForegroundColor Cyan
