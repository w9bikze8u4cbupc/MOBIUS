# Create PR script for preview worker image update
# Extract repository owner and name from origin URL
$originUrl = git remote get-url origin
# Extract owner/repo from URL like https://github.com/owner/repo.git
if ($originUrl -match "github.com/([^/]+)/([^/]+)\.git") {
    $owner = $matches[1]
    $repo = $matches[2]
} else {
    Write-Error "Could not extract owner/repo from origin URL: $originUrl"
    exit 1
}

Write-Host "Creating PR for $owner/$repo"

# Get GitHub token from environment
$token = $env:GITHUB_TOKEN
if (-not $token) {
    Write-Error "GITHUB_TOKEN environment variable not set"
    exit 1
}

# PR details
$branch = "feat/preview-worker-k8s-final-image"
$base = "main"
$title = "k8s: update preview-worker image -> registry.example.com/mobius-preview-worker:1.0.0 (finalize manifests)"

# Read PR body from file
$body = Get-Content -Path "PR_BODY_PREVIEW_WORKER_COMPLETE.md" -Raw

# Create JSON payload
$bodyJson = @{
    title = $title
    body = $body
    head = $branch
    base = $base
} | ConvertTo-Json

# Headers for API request
$headers = @{
    "Authorization" = "token $token"
    "Accept" = "application/vnd.github.v3+json"
}

# Create PR using GitHub API
$uri = "https://api.github.com/repos/$owner/$repo/pulls"
Write-Host "Creating PR: $title"
Write-Host "Base: $base, Head: $branch"

try {
    $response = Invoke-RestMethod -Uri $uri -Method Post -Headers $headers -Body $bodyJson -ContentType "application/json"
    Write-Host "PR created successfully!" -ForegroundColor Green
    Write-Host "PR URL: $($response.html_url)"
    Write-Host "PR number: $($response.number)"
} catch {
    Write-Error "Failed to create PR: $($_.Exception.Message)"
    if ($_.ErrorDetails) {
        Write-Error "Error details: $($_.ErrorDetails)"
    }
    exit 1
}