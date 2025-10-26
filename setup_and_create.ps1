# PowerShell script to set up GitHub token and create PRs/issues
Write-Host "=== GitHub Token Setup and PR Creation ===" -ForegroundColor Green
Write-Host ""

# Check if GitHub token is already set
if (-not $env:GITHUB_TOKEN) {
    Write-Host "GitHub token not found in environment." -ForegroundColor Yellow
    Write-Host "Please create a new Personal Access Token on GitHub with the following scopes:" -ForegroundColor Cyan
    Write-Host "  - repo (Full control of private repositories)" -ForegroundColor Gray
    Write-Host "  - workflow (Update GitHub Action workflows)" -ForegroundColor Gray
    Write-Host "  - public_repo (Access public repositories)" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Instructions:" -ForegroundColor Cyan
    Write-Host "1. Go to https://github.com/settings/tokens/new" -ForegroundColor Gray
    Write-Host "2. Give your token a name (e.g., 'Mobius Tutorial Generator')" -ForegroundColor Gray
    Write-Host "3. Select an expiration date" -ForegroundColor Gray
    Write-Host "4. Check the boxes for 'repo', 'workflow', and 'public_repo' scopes" -ForegroundColor Gray
    Write-Host "5. Click 'Generate token'" -ForegroundColor Gray
    Write-Host "6. Copy the generated token (you won't see it again)" -ForegroundColor Gray
    Write-Host ""
    
    $token = Read-Host "Enter your GitHub Personal Access Token"
    if ($token -ne "") {
        $env:GITHUB_TOKEN = $token
        Write-Host "Token set successfully!" -ForegroundColor Green
    } else {
        Write-Host "No token entered. Exiting." -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "GitHub token already set in environment." -ForegroundColor Green
}

# Set repository variables
$env:OWNER = "w9bikze8u4cbupc"
$env:REPO = "MOBIUS"
Write-Host "Repository variables set:" -ForegroundColor Green
Write-Host "  OWNER: $env:OWNER" -ForegroundColor Gray
Write-Host "  REPO: $env:REPO" -ForegroundColor Gray
Write-Host ""

# Verify token
Write-Host "Verifying token..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "https://api.github.com/user" -Headers @{
        "Authorization" = "token $env:GITHUB_TOKEN"
        "Accept" = "application/vnd.github+json"
    }
    Write-Host "Token verified successfully! User: $($response.login)" -ForegroundColor Green
} catch {
    Write-Host "Token verification failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Please check your token and try again." -ForegroundColor Yellow
    exit 1
}
Write-Host ""

# Ask user what they want to do
Write-Host "What would you like to do?" -ForegroundColor Cyan
Write-Host "1. Create PRs and Issues automatically (using API)" -ForegroundColor Gray
Write-Host "2. Get instructions for manual creation (via web UI)" -ForegroundColor Gray
Write-Host "3. Exit" -ForegroundColor Gray
Write-Host ""

$choice = Read-Host "Enter your choice (1, 2, or 3)"

switch ($choice) {
    "1" {
        Write-Host "Creating PRs and Issues..." -ForegroundColor Yellow
        
        # Create Feature PR
        Write-Host "Creating Feature PR..." -ForegroundColor Yellow
        try {
            $featurePrData = Get-Content -Path "pr_feature.json" -Raw | ConvertFrom-Json
            $featurePrResponse = Invoke-RestMethod -Uri "https://api.github.com/repos/$env:OWNER/$env:REPO/pulls" -Method POST -Headers @{
                "Authorization" = "token $env:GITHUB_TOKEN"
                "Accept" = "application/vnd.github+json"
            } -Body (Get-Content -Path "pr_feature.json" -Raw)
            
            Write-Host "Feature PR created: $($featurePrResponse.html_url)" -ForegroundColor Green
            
            # Add reviewers
            Invoke-RestMethod -Uri "https://api.github.com/repos/$env:OWNER/$REPO/pulls/$($featurePrResponse.number)/requested_reviewers" -Method POST -Headers @{
                "Authorization" = "token $env:GITHUB_TOKEN"
                "Accept" = "application/vnd.github+json"
            } -Body '{"reviewers":["developer","ops","team-lead"]}' | Out-Null
            
            # Add labels
            Invoke-RestMethod -Uri "https://api.github.com/repos/$env:OWNER/$REPO/issues/$($featurePrResponse.number)/labels" -Method POST -Headers @{
                "Authorization" = "token $env:GITHUB_TOKEN"
                "Accept" = "application/vnd.github+json"
            } -Body '{"labels":["feature","phase-f","needs-review","ready-for-staging"]}' | Out-Null
        } catch {
            Write-Host "Failed to create Feature PR: $($_.Exception.Message)" -ForegroundColor Red
        }
        
        # Create CI Workflow PR
        Write-Host "Creating CI Workflow PR..." -ForegroundColor Yellow
        try {
            $ciPrResponse = Invoke-RestMethod -Uri "https://api.github.com/repos/$env:OWNER/$REPO/pulls" -Method POST -Headers @{
                "Authorization" = "token $env:GITHUB_TOKEN"
                "Accept" = "application/vnd.github+json"
            } -Body (Get-Content -Path "pr_ci.json" -Raw)
            
            Write-Host "CI Workflow PR created: $($ciPrResponse.html_url)" -ForegroundColor Green
            
            # Add reviewer
            Invoke-RestMethod -Uri "https://api.github.com/repos/$env:OWNER/$REPO/pulls/$($ciPrResponse.number)/requested_reviewers" -Method POST -Headers @{
                "Authorization" = "token $env:GITHUB_TOKEN"
                "Accept" = "application/vnd.github+json"
            } -Body '{"reviewers":["ops"]}' | Out-Null
            
            # Add labels
            Invoke-RestMethod -Uri "https://api.github.com/repos/$env:OWNER/$REPO/issues/$($ciPrResponse.number)/labels" -Method POST -Headers @{
                "Authorization" = "token $env:GITHUB_TOKEN"
                "Accept" = "application/vnd.github+json"
            } -Body '{"labels":["ci","phase-f"]}' | Out-Null
        } catch {
            Write-Host "Failed to create CI Workflow PR: $($_.Exception.Message)" -ForegroundColor Red
        }
        
        # Create Issues
        Write-Host "Creating Issues..." -ForegroundColor Yellow
        try {
            # Preview Worker Issue
            $previewIssueResponse = Invoke-RestMethod -Uri "https://api.github.com/repos/$env:OWNER/$REPO/issues" -Method POST -Headers @{
                "Authorization" = "token $env:GITHUB_TOKEN"
                "Accept" = "application/vnd.github+json"
            } -Body (Get-Content -Path "preview_issue.json" -Raw)
            Write-Host "Preview Worker Issue created: $($previewIssueResponse.html_url)" -ForegroundColor Green
            
            # Asset Uploads Issue
            $assetIssueResponse = Invoke-RestMethod -Uri "https://api.github.com/repos/$env:OWNER/$REPO/issues" -Method POST -Headers @{
                "Authorization" = "token $env:GITHUB_TOKEN"
                "Accept" = "application/vnd.github+json"
            } -Body (Get-Content -Path "asset_issue.json" -Raw)
            Write-Host "Asset Uploads Issue created: $($assetIssueResponse.html_url)" -ForegroundColor Green
            
            # Packaging Issue
            $packagingIssueResponse = Invoke-RestMethod -Uri "https://api.github.com/repos/$env:OWNER/$REPO/issues" -Method POST -Headers @{
                "Authorization" = "token $env:GITHUB_TOKEN"
                "Accept" = "application/vnd.github+json"
            } -Body (Get-Content -Path "packaging_issue.json" -Raw)
            Write-Host "Packaging Issue created: $($packagingIssueResponse.html_url)" -ForegroundColor Green
        } catch {
            Write-Host "Failed to create Issues: $($_.Exception.Message)" -ForegroundColor Red
        }
        
        Write-Host "All PRs and Issues created successfully!" -ForegroundColor Green
    }
    
    "2" {
        Write-Host "=== Manual Creation Instructions ===" -ForegroundColor Green
        Write-Host ""
        Write-Host "1. Feature PR:" -ForegroundColor Cyan
        Write-Host "   URL: https://github.com/w9bikze8u4cbupc/MOBIUS/compare/staging...phase-f/preview-image-matcher" -ForegroundColor Gray
        Write-Host "   Title: Phase F: Image Matcher UI + Preview backend stub" -ForegroundColor Gray
        Write-Host "   Use content from FEATURE_PR_BODY.md for the description" -ForegroundColor Gray
        Write-Host ""
        Write-Host "2. CI Workflow PR:" -ForegroundColor Cyan
        Write-Host "   URL: https://github.com/w9bikze8u4cbupc/MOBIUS/compare/staging...ci/add-phase-f-verify-workflow" -ForegroundColor Gray
        Write-Host "   Title: CI: Add staging verify workflow for Phase F" -ForegroundColor Gray
        Write-Host "   Use content from CI_WORKFLOW_PR_BODY.md for the description" -ForegroundColor Gray
        Write-Host ""
        Write-Host "3. Issues:" -ForegroundColor Cyan
        Write-Host "   Create three new issues using content from:" -ForegroundColor Gray
        Write-Host "   - ISSUE_PREVIEW_WORKER.md" -ForegroundColor Gray
        Write-Host "   - ISSUE_ASSET_UPLOADS.md" -ForegroundColor Gray
        Write-Host "   - ISSUE_EXPORT_PACKAGING.md" -ForegroundColor Gray
    }
    
    "3" {
        Write-Host "Exiting..." -ForegroundColor Yellow
        exit 0
    }
    
    default {
        Write-Host "Invalid choice. Exiting." -ForegroundColor Red
        exit 1
    }
}