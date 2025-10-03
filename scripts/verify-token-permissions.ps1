# Verify GitHub token permissions script
param(
    [Parameter(Mandatory=$true)]
    [string]$Token
)

$OWNER = "w9bikze8u4cbupc"
$REPO = "mobius-games-tutorial-generator"

# Set headers
$headers = @{
    Authorization = "Bearer $Token"
    Accept = "application/vnd.github+json"
    "X-GitHub-Api-Version" = "2022-11-28"
}

Write-Host "Verifying GitHub token permissions..." -ForegroundColor Green
Write-Host ""

# Check 1: Authenticated user
Write-Host "1. Checking authenticated user..." -ForegroundColor Yellow
try {
    $userResponse = Invoke-RestMethod -Uri "https://api.github.com/user" -Headers $headers -Method GET
    Write-Host "   Status: SUCCESS (200)" -ForegroundColor Green
    Write-Host "   User: $($userResponse.login)" -ForegroundColor Cyan
} catch {
    Write-Host "   Status: FAILED ($($_.Exception.Response.StatusCode.value__))" -ForegroundColor Red
    Write-Host "   Message: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Check 2: Repository access
Write-Host "2. Checking repository access..." -ForegroundColor Yellow
try {
    $repoResponse = Invoke-RestMethod -Uri "https://api.github.com/repos/$OWNER/$REPO" -Headers $headers -Method GET
    Write-Host "   Status: SUCCESS (200)" -ForegroundColor Green
    Write-Host "   Repository: $($repoResponse.name)" -ForegroundColor Cyan
    Write-Host "   Permissions: $($repoResponse.permissions | ConvertTo-Json -Compress)" -ForegroundColor Cyan
} catch {
    Write-Host "   Status: FAILED ($($_.Exception.Response.StatusCode.value__))" -ForegroundColor Red
    Write-Host "   Message: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Check 3: Branch protection (may fail if user doesn't have admin rights)
Write-Host "3. Checking branch protection settings..." -ForegroundColor Yellow
try {
    $protectionResponse = Invoke-RestMethod -Uri "https://api.github.com/repos/$OWNER/$REPO/branches/main/protection" -Headers $headers -Method GET
    Write-Host "   Status: SUCCESS (200)" -ForegroundColor Green
    Write-Host "   Protection enabled: Yes" -ForegroundColor Cyan
    # Show key protection settings
    Write-Host "   Required status checks: $($protectionResponse.required_status_checks.contexts -join ', ')" -ForegroundColor Cyan
    Write-Host "   Enforce admins: $($protectionResponse.enforce_admins.enabled)" -ForegroundColor Cyan
} catch {
    $statusCode = if ($_.Exception.Response) { $_.Exception.Response.StatusCode.value__ } else { "Unknown" }
    Write-Host "   Status: FAILED ($statusCode)" -ForegroundColor Red
    if ($statusCode -eq 403) {
        Write-Host "   Message: Token may not have admin permissions - this is expected for non-admin users" -ForegroundColor Yellow
    } else {
        Write-Host "   Message: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "Verification complete." -ForegroundColor Green