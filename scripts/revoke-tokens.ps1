# Token Revocation and Security Cleanup Script (PowerShell)
# Use this script to safely revoke tokens and clean up after deployment

param(
    [Parameter(Position=0)]
    [string]$Action = "run"
)

# Configuration
$AuditLog = "docs\security-audit-log.md"
$Timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$CleanupLog = "security-cleanup.log"

Write-Host "=== Token Revocation and Security Cleanup ===" -ForegroundColor Cyan
Write-Host "Timestamp: $Timestamp"
Write-Host ""

# Function to log security actions
function Log-SecurityAction {
    param([string]$Action)
    $LogEntry = "$(Get-Date -Format 'yyyy-MM-ddTHH:mm:ssZ') - $Action"
    Add-Content -Path $CleanupLog -Value $LogEntry
}

# Function to check if token is set
function Test-TokenStatus {
    if ($env:GITHUB_TOKEN) {
        Write-Host "WARNING: GITHUB_TOKEN environment variable is still set" -ForegroundColor Yellow
        $TokenPrefix = $env:GITHUB_TOKEN.Substring(0, [Math]::Min(10, $env:GITHUB_TOKEN.Length))
        Write-Host "Token prefix: $TokenPrefix..."
        return $true
    } else {
        Write-Host "✓ GITHUB_TOKEN environment variable is not set" -ForegroundColor Green
        return $false
    }
}

# Function to test token validity
function Test-TokenValidity {
    param([string]$Token)
    
    if (-not $Token) {
        Write-Host "✓ No token to test" -ForegroundColor Green
        return $false
    }
    
    Write-Host "Testing token validity..."
    
    try {
        $Headers = @{
            Authorization = "Bearer $Token"
            Accept = "application/vnd.github+json"
        }
        
        $Response = Invoke-RestMethod -Uri "https://api.github.com/user" -Headers $Headers -Method Get -ErrorAction Stop
        Write-Host "⚠️  Token is still valid and active" -ForegroundColor Red
        return $true
    } catch {
        Write-Host "✓ Token is invalid or revoked" -ForegroundColor Green
        return $false
    }
}

# Function to clear environment variables
function Clear-Environment {
    Write-Host "Clearing environment variables..."
    
    # Clear GitHub-related variables
    $env:GITHUB_TOKEN = $null
    $env:OWNER = $null
    $env:REPO = $null
    $env:BRANCH = $null
    
    # Remove from current session
    Remove-Item Env:GITHUB_TOKEN -ErrorAction SilentlyContinue
    Remove-Item Env:OWNER -ErrorAction SilentlyContinue
    Remove-Item Env:REPO -ErrorAction SilentlyContinue
    Remove-Item Env:BRANCH -ErrorAction SilentlyContinue
    
    Write-Host "✓ Environment variables cleared" -ForegroundColor Green
    Log-SecurityAction "Environment variables cleared"
}

# Function to update security audit log
function Update-AuditLog {
    param(
        [string]$Status,
        [string]$Details
    )
    
    if (Test-Path $AuditLog) {
        $RevocationEntry = @"

## Token Revocation Completed

**Timestamp:** $Timestamp  
**Status:** $Status  
**Details:** $Details  
**Performed By:** $env:USERNAME  
**System:** $env:COMPUTERNAME  

### Actions Taken
- Environment variables cleared
- Token validity tested
- Security cleanup completed
- Audit log updated

"@
        Add-Content -Path $AuditLog -Value $RevocationEntry
        Write-Host "✓ Security audit log updated" -ForegroundColor Green
        Log-SecurityAction "Security audit log updated with revocation status: $Status"
    } else {
        Write-Host "⚠️  Security audit log not found at $AuditLog" -ForegroundColor Yellow
    }
}

# Function to show manual revocation instructions
function Show-ManualInstructions {
    Write-Host "=== Manual Token Revocation Instructions ===" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Since we cannot automatically revoke the token, please follow these steps:"
    Write-Host ""
    Write-Host "1. Open GitHub in your browser"
    Write-Host "2. Go to Settings → Developer settings → Personal access tokens"
    Write-Host "3. Find the token created around 2024-10-04 for branch protection"
    Write-Host "4. Click 'Delete' to revoke the token"
    Write-Host "5. Confirm the revocation"
    Write-Host ""
    Write-Host "After manual revocation, run this script again to verify cleanup."
    Write-Host ""
}

# Function to verify security cleanup
function Test-SecurityCleanup {
    Write-Host "=== Security Cleanup Verification ===" -ForegroundColor Cyan
    Write-Host ""
    
    $AllClear = $true
    
    # Check environment variables
    if (Test-TokenStatus) {
        $AllClear = $false
    }
    
    # Check for any remaining tokens in git config
    try {
        $GitConfig = git config --list 2>$null | Select-String "token"
        if ($GitConfig) {
            Write-Host "⚠️  Potential token found in git config" -ForegroundColor Yellow
            $AllClear = $false
        }
    } catch {
        # Git not available or no config, continue
    }
    
    # Check PowerShell history for tokens (basic check)
    $HistoryPath = (Get-PSReadlineOption).HistorySavePath
    if ($HistoryPath -and (Test-Path $HistoryPath)) {
        $TokenPattern = Select-String -Path $HistoryPath -Pattern "ghp_" -Quiet
        if ($TokenPattern) {
            Write-Host "⚠️  Potential token found in PowerShell history" -ForegroundColor Yellow
            Write-Host "Consider clearing PowerShell history: Clear-History"
            $AllClear = $false
        }
    }
    
    if ($AllClear) {
        Write-Host "✓ Security cleanup verification passed" -ForegroundColor Green
        return $true
    } else {
        Write-Host "⚠️  Security cleanup verification found issues" -ForegroundColor Yellow
        return $false
    }
}

# Main execution function
function Invoke-SecurityCleanup {
    Write-Host "Starting security cleanup process..."
    Write-Host ""
    
    # Store current token for testing (if exists)
    $CurrentToken = $env:GITHUB_TOKEN
    
    # Clear environment variables
    Clear-Environment
    
    # Test if token is still valid (if we had one)
    if ($CurrentToken) {
        Write-Host ""
        if (Test-TokenValidity -Token $CurrentToken) {
            Write-Host "CRITICAL: Token is still active and needs manual revocation" -ForegroundColor Red
            Show-ManualInstructions
            Update-AuditLog -Status "PENDING" -Details "Token still active - manual revocation required"
            Log-SecurityAction "CRITICAL: Token still active, manual revocation required"
        } else {
            Write-Host "✓ Token appears to be already revoked" -ForegroundColor Green
            Update-AuditLog -Status "COMPLETED" -Details "Token successfully revoked"
            Log-SecurityAction "Token revocation verified - token is invalid"
        }
    } else {
        Write-Host "✓ No active token found in environment" -ForegroundColor Green
        Update-AuditLog -Status "COMPLETED" -Details "No active token found - cleanup completed"
        Log-SecurityAction "No active token found in environment"
    }
    
    Write-Host ""
    $CleanupPassed = Test-SecurityCleanup
    
    Write-Host ""
    Write-Host "=== Security Cleanup Summary ===" -ForegroundColor Cyan
    Write-Host "- Environment variables: Cleared"
    Write-Host "- Token validity: Tested"
    Write-Host "- Audit log: Updated"
    Write-Host "- Verification: Completed"
    Write-Host ""
    Write-Host "Security cleanup log: $CleanupLog"
    Write-Host "Full audit log: $AuditLog"
    Write-Host ""
    
    if ($CurrentToken -and (Test-TokenValidity -Token $CurrentToken)) {
        Write-Host "⚠️  MANUAL ACTION REQUIRED: Token revocation" -ForegroundColor Red
        exit 1
    } else {
        Write-Host "✓ Security cleanup completed successfully" -ForegroundColor Green
        exit 0
    }
}

# Help function
function Show-Help {
    Write-Host "Token Revocation and Security Cleanup Script (PowerShell)"
    Write-Host ""
    Write-Host "Usage:"
    Write-Host "  .\revoke-tokens.ps1                    - Run full security cleanup"
    Write-Host "  .\revoke-tokens.ps1 check              - Check current security status"
    Write-Host "  .\revoke-tokens.ps1 verify             - Verify cleanup completion"
    Write-Host "  .\revoke-tokens.ps1 help               - Show this help"
    Write-Host ""
    Write-Host "This script will:"
    Write-Host "  1. Clear environment variables"
    Write-Host "  2. Test token validity"
    Write-Host "  3. Update security audit log"
    Write-Host "  4. Verify cleanup completion"
    Write-Host ""
}

# Command line argument handling
switch ($Action.ToLower()) {
    "check" {
        Write-Host "Checking current security status..."
        Test-TokenStatus
    }
    "verify" {
        Write-Host "Verifying security cleanup..."
        Test-SecurityCleanup
    }
    "help" {
        Show-Help
    }
    "run" {
        Invoke-SecurityCleanup
    }
    default {
        Write-Host "Unknown option: $Action" -ForegroundColor Red
        Show-Help
        exit 1
    }
}