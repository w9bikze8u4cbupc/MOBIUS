# Mobius Network Diagnostics Script
# Run this script in an elevated PowerShell (Administrator) to diagnose network connectivity issues
# that may prevent Docker, WSL, and the Mobius API from working properly.

Write-Host "=== Mobius Network Diagnostics ===" -ForegroundColor Cyan
Write-Host ""

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "WARNING: Not running as Administrator. Some tests may fail." -ForegroundColor Yellow
    Write-Host "For full diagnostics, run PowerShell as Administrator." -ForegroundColor Yellow
    Write-Host ""
}

# Test 1: Basic TCP connectivity to common services
Write-Host "1. Testing TCP connectivity to common services..." -ForegroundColor Green
Write-Host ""

$testTargets = @(
    @{Name = "GitHub"; Host = "github.com"; Port = 443},
    @{Name = "NPM Registry"; Host = "registry.npmjs.org"; Port = 443},
    @{Name = "Docker Hub"; Host = "registry-1.docker.io"; Port = 443}
)

foreach ($target in $testTargets) {
    Write-Host "   Testing $($target.Name) ($($target.Host):$($target.Port))..."
    try {
        $result = Test-NetConnection -ComputerName $target.Host -Port $target.Port -WarningAction SilentlyContinue
        if ($result.TcpTestSucceeded) {
            Write-Host "   ✓ SUCCESS: $($target.Name) is reachable" -ForegroundColor Green
        } else {
            Write-Host "   ✗ FAILED: Cannot reach $($target.Name)" -ForegroundColor Red
        }
    } catch {
        Write-Host "   ✗ ERROR: $($_.Exception.Message)" -ForegroundColor Red
    }
    Write-Host ""
}

# Test 2: Windows Firewall status
Write-Host "2. Checking Windows Firewall status..." -ForegroundColor Green
Write-Host ""

try {
    $firewallProfiles = Get-NetFirewallProfile | Select-Object Name, Enabled
    $firewallProfiles | Format-Table -AutoSize | Out-String | ForEach-Object { Write-Host $_ }
} catch {
    Write-Host "   ✗ ERROR: Cannot check firewall status - $($_.Exception.Message)" -ForegroundColor Red
}

# Test 3: Check for existing Mobius firewall rules
Write-Host "3. Checking for existing Mobius firewall rules..." -ForegroundColor Green
Write-Host ""

$mobiusRules = @(
    "Mobius API (TCP 5001) - allow inbound",
    "Docker Desktop (allow)",
    "Docker Desktop (allow inbound)",
    "WSL Allow Outbound HTTP",
    "WSL Allow Outbound HTTPS"
)

foreach ($ruleName in $mobiusRules) {
    try {
        $rule = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
        if ($rule) {
            $enabled = if ($rule.Enabled -eq "True") { "ENABLED" } else { "DISABLED" }
            Write-Host "   ✓ Found: $ruleName [$enabled]" -ForegroundColor Green
        } else {
            Write-Host "   ✗ Not found: $ruleName" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "   ✗ Not found: $ruleName" -ForegroundColor Yellow
    }
}
Write-Host ""

# Test 4: Check for port 5001 listeners
Write-Host "4. Checking if port 5001 is in use..." -ForegroundColor Green
Write-Host ""

try {
    $port5001 = Get-NetTCPConnection -LocalPort 5001 -ErrorAction SilentlyContinue
    if ($port5001) {
        Write-Host "   ✓ Port 5001 is in use (likely Mobius API is running)" -ForegroundColor Green
        $port5001 | Select-Object LocalAddress, LocalPort, State, OwningProcess | Format-Table -AutoSize | Out-String | ForEach-Object { Write-Host $_ }
    } else {
        Write-Host "   ⚠ Port 5001 is not in use (Mobius API not running)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ⚠ Port 5001 is not in use (Mobius API not running)" -ForegroundColor Yellow
}

# Test 5: Check Docker Desktop installation
Write-Host "5. Checking Docker Desktop installation..." -ForegroundColor Green
Write-Host ""

$dockerPaths = @(
    "C:\Program Files\Docker\Docker\Docker Desktop.exe",
    "C:\Program Files\Docker\Docker\resources\bin\docker.exe"
)

foreach ($dockerPath in $dockerPaths) {
    if (Test-Path $dockerPath) {
        Write-Host "   ✓ Found: $dockerPath" -ForegroundColor Green
    } else {
        Write-Host "   ✗ Not found: $dockerPath" -ForegroundColor Yellow
    }
}
Write-Host ""

# Summary
Write-Host "=== Diagnostics Complete ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. If connectivity tests failed, check your network connection and proxy settings" -ForegroundColor White
Write-Host "2. If firewall is blocking, run: .\scripts\add-firewall-rules.ps1" -ForegroundColor White
Write-Host "3. If behind corporate proxy, configure Docker Desktop proxy settings" -ForegroundColor White
Write-Host "4. Save this output and share with support if issues persist" -ForegroundColor White
Write-Host ""
