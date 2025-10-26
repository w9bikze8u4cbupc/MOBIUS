# PowerShell script to set GitHub token and verify access
param(
    [string]$Token = "",
    [string]$Owner = "w9bikze8u4cbupc",
    [string]$Repo = "MOBIUS"
)

Write-Host "=== GitHub Token Verification ===" -ForegroundColor Green
Write-Host ""

# Check if token was provided as parameter
if ($Token -ne "") {
    $env:GITHUB_TOKEN = $Token
    Write-Host "Token set from parameter" -ForegroundColor Yellow
} else {
    # Check if token is already set
    if (-not $env:GITHUB_TOKEN) {
        Write-Host "GitHub token not found in environment." -ForegroundColor Yellow
        $tokenInput = Read-Host "Enter your GitHub Personal Access Token (or press Enter to skip)"
        if ($tokenInput -ne "") {
            $env:GITHUB_TOKEN = $tokenInput
            Write-Host "Token set successfully!" -ForegroundColor Green
        } else {
            Write-Host "No token provided. Exiting." -ForegroundColor Red
            exit 1
        }
    } else {
        Write-Host "GitHub token already set in environment." -ForegroundColor Green
    }
}

# Set repository variables
$env:OWNER = $Owner
$env:REPO = $Repo
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
    Write-Host "✓ Token verified successfully! User: $($response.login)" -ForegroundColor Green
} catch {
    Write-Host "✗ Token verification failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Please check your token and try again." -ForegroundColor Yellow
    exit 1
}
Write-Host ""

# Check repository access
Write-Host "Checking repository access..." -ForegroundColor Yellow
try {
    $repoResponse = Invoke-RestMethod -Uri "https://api.github.com/repos/$env:OWNER/$env:REPO" -Headers @{
        "Authorization" = "token $env:GITHUB_TOKEN"
        "Accept" = "application/vnd.github+json"
    }
    Write-Host "✓ Repository access verified! Repo: $($repoResponse.name)" -ForegroundColor Green
    Write-Host "  Private: $($repoResponse.private)" -ForegroundColor Gray
    Write-Host "  Permissions: $($repoResponse.permissions | ConvertTo-Json -Compress)" -ForegroundColor Gray
} catch {
    Write-Host "✗ Repository access check failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
Write-Host ""

# Check if branches exist
Write-Host "Checking if required branches exist..." -ForegroundColor Yellow
$branches = @("phase-f/preview-image-matcher", "ci/add-phase-f-verify-workflow")
foreach ($branch in $branches) {
    try {
        $branchResponse = Invoke-RestMethod -Uri "https://api.github.com/repos/$env:OWNER/$env:REPO/branches/$branch" -Headers @{
            "Authorization" = "token $env:GITHUB_TOKEN"
            "Accept" = "application/vnd.github+json"
        }
        Write-Host "✓ Branch exists: $branch" -ForegroundColor Green
    } catch {
        Write-Host "? Branch not found: $branch (this is OK if you plan to create it)" -ForegroundColor Yellow
    }
}
Write-Host ""

Write-Host "=== Verification Complete ===" -ForegroundColor Green
Write-Host "Environment variables set:" -ForegroundColor Cyan
Write-Host "  GITHUB_TOKEN: $((($env:GITHUB_TOKEN).Substring(0, 10)) + '...' + (($env:GITHUB_TOKEN).Substring(($env:GITHUB_TOKEN.Length)-4)))" -ForegroundColor Gray
Write-Host "  OWNER: $env:OWNER" -ForegroundColor Gray
Write-Host "  REPO: $env:REPO" -ForegroundColor Gray
Write-Host ""
Write-Host "You can now run the create_prs_and_issues.ps1 script" -ForegroundColor Green