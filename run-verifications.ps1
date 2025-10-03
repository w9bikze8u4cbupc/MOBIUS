# Run all verification checks
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

Write-Host "Running verification checks..." -ForegroundColor Green
Write-Host "============================" -ForegroundColor Green
Write-Host ""

# Check 1: Authenticated user
Write-Host "1. Authenticated user check:" -ForegroundColor Yellow
try {
    $userResponse = Invoke-RestMethod -Uri "https://api.github.com/user" -Headers $headers -Method GET
    Write-Host "   Status code: 200" -ForegroundColor Green
    Write-Host "   User: $($userResponse.login)" -ForegroundColor Cyan
} catch {
    $statusCode = if ($_.Exception.Response) { $_.Exception.Response.StatusCode.value__ } else { "Unknown" }
    Write-Host "   Status code: $statusCode" -ForegroundColor Red
    Write-Host "   Failed to authenticate" -ForegroundColor Red
}

Write-Host ""

# Check 2: Repository access
Write-Host "2. Repository access check:" -ForegroundColor Yellow
try {
    $repoResponse = Invoke-RestMethod -Uri "https://api.github.com/repos/$OWNER/$REPO" -Headers $headers -Method GET
    Write-Host "   Status code: 200" -ForegroundColor Green
    $repoInfo = @{
        name = $repoResponse.name
        private = $repoResponse.private
        permissions = $repoResponse.permissions
    }
    Write-Host "   Repository info: $($repoInfo | ConvertTo-Json -Compress)" -ForegroundColor Cyan
} catch {
    $statusCode = if ($_.Exception.Response) { $_.Exception.Response.StatusCode.value__ } else { "Unknown" }
    Write-Host "   Status code: $statusCode" -ForegroundColor Red
    Write-Host "   Failed to access repository" -ForegroundColor Red
}

Write-Host ""

# Check 3: Branch protection
Write-Host "3. Branch protection check:" -ForegroundColor Yellow
try {
    $protectionResponse = Invoke-RestMethod -Uri "https://api.github.com/repos/$OWNER/$REPO/branches/main/protection" -Headers $headers -Method GET
    Write-Host "   Status: Success" -ForegroundColor Green
    Write-Host "   Protection details (redacted sensitive info):" -ForegroundColor Cyan
    
    # Create a redacted version of the protection response
    $redactedProtection = @{
        url = $protectionResponse.url
        required_status_checks = $protectionResponse.required_status_checks
        enforce_admins = $protectionResponse.enforce_admins
        required_pull_request_reviews = $protectionResponse.required_pull_request_reviews
        restrictions = $protectionResponse.restrictions
    }
    
    Write-Host ($redactedProtection | ConvertTo-Json -Depth 3) -ForegroundColor Cyan
} catch {
    $statusCode = if ($_.Exception.Response) { $_.Exception.Response.StatusCode.value__ } else { "Unknown" }
    Write-Host "   Status: Error - $statusCode" -ForegroundColor Red
    Write-Host "   This is expected if the token doesn't have admin permissions" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Verification checks completed." -ForegroundColor Green