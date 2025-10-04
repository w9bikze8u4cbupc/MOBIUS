# update-branch-protection-contexts.ps1 - Update branch protection required status check contexts

param(
    [string]$Owner = $env:OWNER,
    [string]$Repo = $env:REPO,
    [string]$Branch = $env:BRANCH,
    [switch]$Force
)

# Configuration - UPDATE THESE VALUES
if (-not $Owner) { $Owner = "your-org-or-user" }
if (-not $Repo) { $Repo = "your-repo" }
if (-not $Branch) { $Branch = "main" }

# NEW_CONTEXTS - Replace with exact check-run names from capture-check-runs bot comment
$NEW_CONTEXTS = @(
    "CI / build-and-qa (ubuntu-latest)",
    "CI / build-and-qa (macos-latest)",
    "CI / build-and-qa (windows-latest)"
)

# Validate required environment variables
if (-not $env:GITHUB_TOKEN) {
    Write-Host "❌ GITHUB_TOKEN environment variable is required" -ForegroundColor Red
    Write-Host "   Set your GitHub admin token: `$env:GITHUB_TOKEN = 'ghp_your_admin_token_here'" -ForegroundColor Yellow
    exit 1
}

if ($Owner -eq "your-org-or-user" -or $Repo -eq "your-repo") {
    Write-Host "❌ Please update Owner and Repo parameters or environment variables" -ForegroundColor Red
    Write-Host "   Current: Owner=$Owner, Repo=$Repo" -ForegroundColor Yellow
    Write-Host "   Usage: .\update-branch-protection-contexts.ps1 -Owner 'myorg' -Repo 'myrepo'" -ForegroundColor Yellow
    exit 1
}

$headers = @{
    Authorization = "token $env:GITHUB_TOKEN"
    Accept = "application/vnd.github+json"
}

Write-Host "🔧 Branch Protection Context Update Tool" -ForegroundColor Cyan
Write-Host "   Repository: $Owner/$Repo" -ForegroundColor White
Write-Host "   Branch: $Branch" -ForegroundColor White
Write-Host ""

# Step 1: Backup current protection
Write-Host "📦 Step 1: Backing up current branch protection..." -ForegroundColor Cyan
$backupDir = "$env:TEMP\branch-protection-backup"
if (-not (Test-Path $backupDir)) {
    New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupFile = "$backupDir\protection-backup-$timestamp.json"

try {
    $currentProtection = Invoke-RestMethod -Uri "https://api.github.com/repos/$Owner/$Repo/branches/$Branch/protection" -Headers $headers
    $currentProtection | ConvertTo-Json -Depth 20 | Out-File -FilePath $backupFile -Encoding UTF8
    Write-Host "✅ Current protection backed up to: $backupFile" -ForegroundColor Green
} catch {
    if ($_.Exception.Response.StatusCode -eq 404) {
        Write-Host "⚠️  Could not backup current protection (branch may not be protected yet)" -ForegroundColor Yellow
        @{} | ConvertTo-Json | Out-File -FilePath $backupFile -Encoding UTF8
    } else {
        Write-Host "❌ Error backing up protection: $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }
}

# Step 2: Build preview JSON
Write-Host ""
Write-Host "🔍 Step 2: Building preview JSON..." -ForegroundColor Cyan
$previewFile = "$env:TEMP\branch-protection-preview.json"

# Create the protection configuration
$protectionConfig = @{
    required_status_checks = @{
        required = $true
        strict = $true
        contexts = $NEW_CONTEXTS
    }
    enforce_admins = @{
        enabled = $true
    }
    required_pull_request_reviews = @{
        required_approving_review_count = 1
        dismiss_stale_reviews = $true
        require_code_owner_reviews = $false
    }
    restrictions = $null
}

# If we have existing protection, preserve other settings
if (Test-Path $backupFile) {
    try {
        $existingProtection = Get-Content $backupFile -Raw | ConvertFrom-Json
        if ($existingProtection -and $existingProtection.PSObject.Properties.Count -gt 0) {
            # Preserve existing settings, only update the contexts
            if ($existingProtection.required_status_checks) {
                $protectionConfig.required_status_checks.required = $existingProtection.required_status_checks.required
            }
            if ($existingProtection.enforce_admins) {
                $protectionConfig.enforce_admins.enabled = $existingProtection.enforce_admins.enabled
            }
            if ($existingProtection.required_pull_request_reviews) {
                $protectionConfig.required_pull_request_reviews = $existingProtection.required_pull_request_reviews
            }
        }
    } catch {
        Write-Host "⚠️  Could not parse existing protection, using defaults" -ForegroundColor Yellow
    }
}

$protectionConfig | ConvertTo-Json -Depth 20 | Out-File -FilePath $previewFile -Encoding UTF8
Write-Host "✅ Preview JSON created: $previewFile" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Preview of changes:" -ForegroundColor Cyan
Write-Host "   New required status check contexts:" -ForegroundColor White
$NEW_CONTEXTS | ForEach-Object { Write-Host "     - $_" -ForegroundColor White }
Write-Host ""
Write-Host "📄 Full preview JSON:" -ForegroundColor Cyan
Get-Content $previewFile | ConvertFrom-Json | ConvertTo-Json -Depth 20

# Step 3: Confirmation prompt
if (-not $Force) {
    Write-Host ""
    Write-Host "⚠️  CONFIRMATION REQUIRED" -ForegroundColor Yellow
    Write-Host "   This will update branch protection for $Owner/$Repo branch '$Branch'" -ForegroundColor White
    Write-Host "   The above contexts will be REQUIRED for all PRs to merge" -ForegroundColor White
    Write-Host ""
    $confirm = Read-Host "   Do you want to proceed? (yes/no)"
    
    if ($confirm -ne "yes") {
        Write-Host "❌ Operation cancelled by user" -ForegroundColor Red
        Write-Host "   Preview file saved at: $previewFile" -ForegroundColor Yellow
        Write-Host "   Backup file saved at: $backupFile" -ForegroundColor Yellow
        exit 0
    }
}

# Step 4: Apply the changes
Write-Host ""
Write-Host "🚀 Step 4: Applying branch protection changes..." -ForegroundColor Cyan
$applyFile = "$env:TEMP\branch-protection-apply.json"
Copy-Item $previewFile $applyFile

try {
    $applyResponse = Invoke-RestMethod -Method Put -Uri "https://api.github.com/repos/$Owner/$Repo/branches/$Branch/protection" -Headers $headers -Body (Get-Content $applyFile -Raw) -ContentType "application/json"
    
    Write-Host "✅ Branch protection updated successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "📄 Applied configuration response:" -ForegroundColor Cyan
    $applyResponse | ConvertTo-Json -Depth 20
    
    # Save the response
    $responseFile = "$env:TEMP\branch-protection-applied-$timestamp.json"
    $applyResponse | ConvertTo-Json -Depth 20 | Out-File -FilePath $responseFile -Encoding UTF8
} catch {
    Write-Host "❌ Failed to apply branch protection changes" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $errorResponse = $_.Exception.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($errorResponse)
        $errorBody = $reader.ReadToEnd()
        Write-Host "   Response: $errorBody" -ForegroundColor Red
    }
    exit 1
}

# Step 5: Verify the changes
Write-Host ""
Write-Host "🔍 Step 5: Verifying applied changes..." -ForegroundColor Cyan
try {
    $verifyResponse = Invoke-RestMethod -Uri "https://api.github.com/repos/$Owner/$Repo/branches/$Branch/protection" -Headers $headers
    
    Write-Host "✅ Verification complete!" -ForegroundColor Green
    Write-Host ""
    Write-Host "📋 Currently required status check contexts:" -ForegroundColor Cyan
    if ($verifyResponse.required_status_checks -and $verifyResponse.required_status_checks.contexts) {
        $verifyResponse.required_status_checks.contexts | ForEach-Object { Write-Host "   - $_" -ForegroundColor White }
    } else {
        Write-Host "   (none - this may indicate an error)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "⚠️  Could not verify changes: $($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "📁 Files created:" -ForegroundColor Cyan
Write-Host "   Backup: $backupFile" -ForegroundColor White
Write-Host "   Preview: $previewFile" -ForegroundColor White
Write-Host "   Applied: $applyFile" -ForegroundColor White
Write-Host ""
Write-Host "🎉 Branch protection context update complete!" -ForegroundColor Green
Write-Host ""
Write-Host "⚠️  IMPORTANT: Monitor your CI for 24-72 hours to ensure no false positives" -ForegroundColor Yellow
Write-Host "   If issues occur, restore from backup using:" -ForegroundColor Yellow
Write-Host "   Invoke-RestMethod -Method Put -Uri `"https://api.github.com/repos/$Owner/$Repo/branches/$Branch/protection`" -Headers @{Authorization=`"token `$env:GITHUB_TOKEN`";Accept=`"application/vnd.github+json`"} -Body (Get-Content `"$backupFile`" -Raw) -ContentType `"application/json`"" -ForegroundColor Gray