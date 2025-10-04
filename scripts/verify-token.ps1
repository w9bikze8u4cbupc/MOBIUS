# verify-token.ps1 - Verify GitHub token has required permissions for branch protection

param(
    [string]$Owner = $env:OWNER,
    [string]$Repo = $env:REPO,
    [string]$Branch = $env:BRANCH
)

Write-Host "🔍 Verifying GitHub token permissions..." -ForegroundColor Cyan

# Check if GITHUB_TOKEN is set
if (-not $env:GITHUB_TOKEN) {
    Write-Host "❌ GITHUB_TOKEN environment variable is not set" -ForegroundColor Red
    Write-Host "   Set your GitHub token: `$env:GITHUB_TOKEN = 'ghp_your_token_here'" -ForegroundColor Yellow
    exit 1
}

$headers = @{
    Authorization = "token $env:GITHUB_TOKEN"
    Accept = "application/vnd.github+json"
}

# Test basic API access
Write-Host "📡 Testing basic API access..." -ForegroundColor Cyan
try {
    $rateLimitResponse = Invoke-RestMethod -Uri "https://api.github.com/rate_limit" -Headers $headers
    $rateLimit = $rateLimitResponse.rate.remaining
    Write-Host "✅ API access successful (rate limit remaining: $rateLimit)" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to access GitHub API - check token validity" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Get authenticated user info
Write-Host "👤 Getting authenticated user info..." -ForegroundColor Cyan
try {
    $userInfo = Invoke-RestMethod -Uri "https://api.github.com/user" -Headers $headers
    $username = $userInfo.login
    Write-Host "✅ Authenticated as: $username" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to get user info" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Check token scopes
Write-Host "🔐 Checking token scopes..." -ForegroundColor Cyan
try {
    $response = Invoke-WebRequest -Uri "https://api.github.com/user" -Headers $headers -Method Head
    $scopesHeader = $response.Headers['X-OAuth-Scopes']
    
    if ($scopesHeader) {
        $scopes = $scopesHeader -join ', '
        Write-Host "✅ Token scopes: $scopes" -ForegroundColor Green
        
        # Check for required scopes
        if ($scopes -match "repo") {
            Write-Host "✅ Has 'repo' scope (includes branch protection)" -ForegroundColor Green
        } elseif ($scopes -match "public_repo") {
            Write-Host "⚠️  Has 'public_repo' scope (may work for public repos only)" -ForegroundColor Yellow
        } else {
            Write-Host "❌ Missing required 'repo' scope for branch protection" -ForegroundColor Red
            Write-Host "   Token needs 'repo' scope to modify branch protection rules" -ForegroundColor Yellow
            exit 1
        }
    } else {
        Write-Host "⚠️  Could not determine token scopes (may be a fine-grained token)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "⚠️  Could not check token scopes" -ForegroundColor Yellow
}

# Test repository access (if Owner and Repo are provided)
if ($Owner -and $Repo) {
    Write-Host "🏢 Testing repository access for $Owner/$Repo..." -ForegroundColor Cyan
    
    try {
        $repoInfo = Invoke-RestMethod -Uri "https://api.github.com/repos/$Owner/$Repo" -Headers $headers
        
        $adminAccess = $repoInfo.permissions.admin
        
        if ($adminAccess) {
            Write-Host "✅ Has admin access to $Owner/$Repo" -ForegroundColor Green
        } else {
            Write-Host "❌ Missing admin access to $Owner/$Repo" -ForegroundColor Red
            Write-Host "   Admin access required to modify branch protection rules" -ForegroundColor Yellow
            exit 1
        }
        
        # Test branch protection access
        $targetBranch = if ($Branch) { $Branch } else { "main" }
        Write-Host "🛡️  Testing branch protection access for $targetBranch..." -ForegroundColor Cyan
        
        try {
            $protectionResponse = Invoke-RestMethod -Uri "https://api.github.com/repos/$Owner/$Repo/branches/$targetBranch/protection" -Headers $headers
            Write-Host "✅ Can read branch protection for $targetBranch" -ForegroundColor Green
            
            $currentContexts = $protectionResponse.required_status_checks.contexts
            if ($currentContexts) {
                Write-Host "📋 Current required contexts:" -ForegroundColor Cyan
                $currentContexts | ForEach-Object { Write-Host "   - $_" -ForegroundColor White }
                
                # Save to temp file for reference
                $currentContexts | ConvertTo-Json | Out-File -FilePath "$env:TEMP\current-contexts.json" -Encoding UTF8
            } else {
                Write-Host "📋 No required status check contexts currently configured" -ForegroundColor Yellow
            }
        } catch {
            if ($_.Exception.Response.StatusCode -eq 404) {
                Write-Host "⚠️  Branch $targetBranch may not have protection rules yet (this is OK)" -ForegroundColor Yellow
            } else {
                Write-Host "⚠️  Could not read branch protection: $($_.Exception.Message)" -ForegroundColor Yellow
            }
        }
    } catch {
        Write-Host "❌ Cannot access repository $Owner/$Repo" -ForegroundColor Red
        Write-Host "   Check that the repository exists and token has access" -ForegroundColor Yellow
        Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "ℹ️  Set OWNER and REPO environment variables to test repository-specific permissions" -ForegroundColor Blue
    Write-Host "   Example: `$env:OWNER = 'myorg'; `$env:REPO = 'myrepo'" -ForegroundColor Blue
}

Write-Host ""
Write-Host "🎉 Token verification complete!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Summary:" -ForegroundColor Cyan
Write-Host "   ✅ Token is valid and has API access" -ForegroundColor Green
Write-Host "   ✅ Authenticated as: $username" -ForegroundColor Green
if ($Owner -and $Repo) {
    Write-Host "   ✅ Has admin access to $Owner/$Repo" -ForegroundColor Green
    Write-Host "   ✅ Can access branch protection settings" -ForegroundColor Green
}
Write-Host ""
Write-Host "🚀 Ready to proceed with branch protection updates!" -ForegroundColor Green