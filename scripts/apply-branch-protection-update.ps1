# Apply Branch Protection Update Script
# This script updates GitHub branch protection with the captured check-run contexts

param(
    [Parameter(Mandatory=$false)]
    [string]$Owner = "w9bikze8u4cbupc",
    
    [Parameter(Mandatory=$false)]
    [string]$Repo = "MOBIUS",
    
    [Parameter(Mandatory=$false)]
    [string]$Branch = "main",
    
    [Parameter(Mandatory=$false)]
    [string]$GitHubToken = $env:GITHUB_TOKEN,
    
    [Parameter(Mandatory=$false)]
    [switch]$Force
)

# Captured check-run contexts from PR #161
$Contexts = @(
    "build-and-qa (macos-latest)",
    "build-and-qa (ubuntu-latest)", 
    "build-and-qa (windows-latest)",
    "Golden checks (macos-latest)",
    "Golden checks (ubuntu-latest)",
    "Golden checks (windows-latest)"
)

# Setup
$Timestamp = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ")
$BackupDir = "branch-protection-backups\$Timestamp"
$Headers = @{
    Authorization = "Bearer $GitHubToken"
    Accept = "application/vnd.github+json"
    "X-GitHub-Api-Version" = "2022-11-28"
}

Write-Host "=== Branch Protection Update Script ===" -ForegroundColor Cyan
Write-Host "Repository: $Owner/$Repo" -ForegroundColor White
Write-Host "Branch: $Branch" -ForegroundColor White
Write-Host "Contexts to enforce: $($Contexts.Count)" -ForegroundColor White
Write-Host ""

# Validate prerequisites
if (-not $GitHubToken) {
    Write-Host "ERROR: GitHub token not provided. Set GITHUB_TOKEN environment variable or use -GitHubToken parameter." -ForegroundColor Red
    Write-Host "Example: `$env:GITHUB_TOKEN = 'ghp_your_token_here'" -ForegroundColor Yellow
    exit 1
}

# Create backup directory
New-Item -Path $BackupDir -ItemType Directory -Force | Out-Null
Write-Host "Backup directory: $BackupDir" -ForegroundColor Green

try {
    # Step 1: Optional token verification
    Write-Host "`n=== Step 1: Token Verification ===" -ForegroundColor Cyan
    if (Test-Path "scripts\verify-token.ps1") {
        Write-Host "Running token verification..." -ForegroundColor Yellow
        & ".\scripts\verify-token.ps1" -Owner $Owner -Repo $Repo -Branch $Branch
        if ($LASTEXITCODE -ne 0) {
            Write-Host "Token verification failed. Please check your token permissions." -ForegroundColor Red
            exit 1
        }
    } else {
        Write-Host "Token verification script not found, skipping..." -ForegroundColor Yellow
    }

    # Step 2: Backup current protection
    Write-Host "`n=== Step 2: Backup Current Protection ===" -ForegroundColor Cyan
    Write-Host "Fetching current branch protection settings..." -ForegroundColor Yellow

    $Before = $null
    try {
        $Before = Invoke-RestMethod -Uri "https://api.github.com/repos/$Owner/$Repo/branches/$Branch/protection" `
                    -Headers $Headers -Method Get

        $Before | ConvertTo-Json -Depth 10 | Out-File -FilePath "$BackupDir\$Branch-before.json" -Encoding UTF8
        Write-Host "Backup saved to: $BackupDir\$Branch-before.json" -ForegroundColor Green
    } catch {
        if ($_.Exception.Response.StatusCode -eq 404) {
            Write-Host "No existing branch protection found (this is OK for first-time setup)" -ForegroundColor Yellow
            # Create empty backup file for reference
            @{
                message = "No branch protection was configured before this update"
                timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
            } | ConvertTo-Json | Out-File -FilePath "$BackupDir\$Branch-before.json" -Encoding UTF8
            Write-Host "Empty backup created: $BackupDir\$Branch-before.json" -ForegroundColor Green
        } else {
            throw $_
        }
    }

    # Display current contexts
    if ($Before -and $Before.required_status_checks -and $Before.required_status_checks.checks) {
        Write-Host "`nCurrent required status checks:" -ForegroundColor White
        $Before.required_status_checks.checks | ForEach-Object {
            Write-Host "  - $($_.context)" -ForegroundColor Gray
        }
    } else {
        Write-Host "No current required status checks found." -ForegroundColor Gray
    }

    # Step 3: Build and preview payload
    Write-Host "`n=== Step 3: Preview New Configuration ===" -ForegroundColor Cyan
    
    $Payload = @{
        strict = $true
        checks = $Contexts | ForEach-Object { @{ context = $_; app_id = $null } }
    }
    
    $PayloadJson = $Payload | ConvertTo-Json -Depth 6
    $PayloadJson | Out-File -FilePath "$BackupDir\required-status-checks.json" -Encoding UTF8
    
    Write-Host "New required status checks configuration:" -ForegroundColor White
    Write-Host $PayloadJson -ForegroundColor Gray
    
    Write-Host "`nNew contexts to be enforced:" -ForegroundColor White
    $Contexts | ForEach-Object { Write-Host "  - $_" -ForegroundColor Green }

    # Step 4: Confirmation and apply
    Write-Host "`n=== Step 4: Apply Changes ===" -ForegroundColor Cyan
    
    if (-not $Force) {
        Write-Host "This will update branch protection for $Owner/$Repo branch '$Branch'" -ForegroundColor Yellow
        Write-Host "All future PRs will require these $($Contexts.Count) checks to pass before merging." -ForegroundColor Yellow
        $confirm = Read-Host "`nType 'apply' to proceed with the update"
        
        if ($confirm -ne "apply") {
            Write-Host "Operation cancelled. No changes were made." -ForegroundColor Yellow
            exit 0
        }
    }
    
    Write-Host "Applying branch protection update..." -ForegroundColor Yellow

    # Build complete branch protection payload
    $ProtectionPayload = @{
        required_status_checks = @{
            strict = $true
            checks = $Contexts | ForEach-Object {
                @{
                    context = $_
                    app_id = $null
                }
            }
        }
        enforce_admins = $false
        required_pull_request_reviews = $null
        restrictions = $null
    }

    $ProtectionPayloadJson = $ProtectionPayload | ConvertTo-Json -Depth 10

    try {
        # Try PATCH first (for existing protection)
        $Response = Invoke-RestMethod `
            -Uri "https://api.github.com/repos/$Owner/$Repo/branches/$Branch/protection/required_status_checks" `
            -Headers $Headers -Method Patch `
            -Body $PayloadJson -ContentType "application/json"

        Write-Host "✅ Updated existing branch protection" -ForegroundColor Green
    } catch {
        if ($_.Exception.Response.StatusCode -eq 404) {
            Write-Host "No existing protection found, creating new branch protection..." -ForegroundColor Yellow

            # Create new branch protection with PUT
            $Response = Invoke-RestMethod `
                -Uri "https://api.github.com/repos/$Owner/$Repo/branches/$Branch/protection" `
                -Headers $Headers -Method Put `
                -Body $ProtectionPayloadJson -ContentType "application/json"

            Write-Host "✅ Created new branch protection" -ForegroundColor Green
        } else {
            throw $_
        }
    }

    $Response | ConvertTo-Json -Depth 10 | Out-File -FilePath "$BackupDir\update-response.json" -Encoding UTF8
    Write-Host "Update response saved to: $BackupDir\update-response.json" -ForegroundColor Green

    # Step 5: Verify the update
    Write-Host "`n=== Step 5: Verification ===" -ForegroundColor Cyan
    Write-Host "Fetching updated branch protection settings..." -ForegroundColor Yellow
    
    Start-Sleep -Seconds 2  # Brief pause to ensure changes are propagated
    
    $After = Invoke-RestMethod -Uri "https://api.github.com/repos/$Owner/$Repo/branches/$Branch/protection" `
                -Headers $Headers -Method Get
    
    $After | ConvertTo-Json -Depth 10 | Out-File -FilePath "$BackupDir\$Branch-after.json" -Encoding UTF8
    Write-Host "Post-update backup saved to: $BackupDir\$Branch-after.json" -ForegroundColor Green
    
    # Verify contexts are present
    if ($After.required_status_checks -and $After.required_status_checks.checks) {
        $UpdatedContexts = $After.required_status_checks.checks | ForEach-Object { $_.context }
        
        Write-Host "`nVerification Results:" -ForegroundColor White
        Write-Host "Expected contexts: $($Contexts.Count)" -ForegroundColor White
        Write-Host "Applied contexts: $($UpdatedContexts.Count)" -ForegroundColor White
        
        $Missing = $Contexts | Where-Object { $_ -notin $UpdatedContexts }
        $Extra = $UpdatedContexts | Where-Object { $_ -notin $Contexts }
        
        if ($Missing.Count -eq 0 -and $Extra.Count -eq 0) {
            Write-Host "✅ SUCCESS: All contexts applied correctly!" -ForegroundColor Green
        } else {
            if ($Missing.Count -gt 0) {
                Write-Host "⚠️  Missing contexts:" -ForegroundColor Yellow
                $Missing | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
            }
            if ($Extra.Count -gt 0) {
                Write-Host "⚠️  Extra contexts:" -ForegroundColor Yellow
                $Extra | ForEach-Object { Write-Host "  - $_" -ForegroundColor Blue }
            }
        }
        
        Write-Host "`nCurrent required status checks:" -ForegroundColor White
        $UpdatedContexts | ForEach-Object { Write-Host "  - $_" -ForegroundColor Gray }
    } else {
        Write-Host "❌ ERROR: No required status checks found after update!" -ForegroundColor Red
    }

    Write-Host "`n=== Summary ===" -ForegroundColor Cyan
    Write-Host "✅ Branch protection updated successfully" -ForegroundColor Green
    Write-Host "📁 All backups saved to: $BackupDir" -ForegroundColor White
    Write-Host "📋 Rollback instructions: See STRICTER_PROTECTION_ROLLBACK_PLAN.md" -ForegroundColor White
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Yellow
    Write-Host "1. Monitor PR #161 until all required checks pass" -ForegroundColor White
    Write-Host "2. Merge the PR to enable automatic check capture" -ForegroundColor White
    Write-Host "3. Monitor for 24-72 hours for any issues" -ForegroundColor White

} catch {
    Write-Host "`n❌ ERROR: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Backup directory: $BackupDir" -ForegroundColor White
    Write-Host "Check the rollback plan if you need to revert changes." -ForegroundColor Yellow
    exit 1
}