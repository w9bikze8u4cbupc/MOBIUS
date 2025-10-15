# setup-ci-cd.ps1
# PowerShell script to set up CI/CD pipeline configuration

Write-Host "Setting up CI/CD pipeline configuration..." -ForegroundColor Green

# 1. Configure GitHub Secrets
Write-Host "1. Configuring GitHub Secrets..." -ForegroundColor Yellow

# Check if GitHub CLI is installed
try {
    $ghVersion = gh --version
    Write-Host "GitHub CLI found: $ghVersion" -ForegroundColor Green
} catch {
    Write-Host "GitHub CLI not found. Please install it from https://cli.github.com/" -ForegroundColor Red
    exit 1
}

# Get repository information
$repo = gh repo view --json nameWithOwner -q '.nameWithOwner'
Write-Host "Configuring repository: $repo" -ForegroundColor Cyan

# Set up GHCR PAT secret
Write-Host "Setting up GHCR_PAT secret..." -ForegroundColor Yellow
$ghcrPat = Read-Host -Prompt "Enter your GHCR Personal Access Token" -AsSecureString
$ptr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($ghcrPat)
$ghcrPatPlain = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($ptr)
[System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)

gh secret set GHCR_PAT --body="$ghcrPatPlain" --repo="$repo"
Write-Host "GHCR_PAT secret configured successfully" -ForegroundColor Green

# Set up KUBECONFIG_DATA secret
Write-Host "Setting up KUBECONFIG_DATA secret..." -ForegroundColor Yellow
$kubeconfigPath = Read-Host -Prompt "Enter path to your kubeconfig file (or press Enter to skip)"
if ($kubeconfigPath -and (Test-Path $kubeconfigPath)) {
    $kubeconfigData = [Convert]::ToBase64String([IO.File]::ReadAllBytes($kubeconfigPath))
    gh secret set KUBECONFIG_DATA --body="$kubeconfigData" --repo="$repo"
    Write-Host "KUBECONFIG_DATA secret configured successfully" -ForegroundColor Green
} else {
    Write-Host "Skipping KUBECONFIG_DATA setup" -ForegroundColor Yellow
}

# 2. Configure Branch Protection Rules
Write-Host "2. Configuring Branch Protection Rules..." -ForegroundColor Yellow

# Protect main branch
Write-Host "Protecting main branch..." -ForegroundColor Yellow
gh api -X PUT /repos/$repo/branches/main/protection \
    --field required_status_checks[strict]=true \
    --field required_status_checks[contexts][]="build-preview-worker" \
    --field required_status_checks[contexts][]="test-deployment-scripts" \
    --field enforce_admins=true \
    --field required_linear_history=true \
    --field allow_force_pushes=false \
    --field allow_deletions=false

Write-Host "Main branch protection configured successfully" -ForegroundColor Green

# 3. Configure Environment Protection Rules
Write-Host "3. Configuring Environment Protection Rules..." -ForegroundColor Yellow

# Create staging environment
Write-Host "Creating staging environment..." -ForegroundColor Yellow
gh api -X PUT /repos/$repo/environments/staging \
    --field deployment_branches[]="main" \
    --field wait_timer=0

Write-Host "Staging environment configured successfully" -ForegroundColor Green

# Create production environment
Write-Host "Creating production environment..." -ForegroundColor Yellow
gh api -X PUT /repos/$repo/environments/production \
    --field deployment_branches[]="main" \
    --field wait_timer=5

Write-Host "Production environment configured successfully" -ForegroundColor Green

Write-Host "CI/CD pipeline setup completed successfully!" -ForegroundColor Green
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Verify secrets in GitHub repository settings" -ForegroundColor Cyan
Write-Host "2. Test branch protection by creating a pull request" -ForegroundColor Cyan
Write-Host "3. Validate environment protection by triggering a deployment" -ForegroundColor Cyan