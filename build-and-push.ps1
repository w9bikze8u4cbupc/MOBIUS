param(
    [string]$ImageTag = "",
    [switch]$DryRun
)

# VARIABLES (edit only if needed)
$Image = if ($ImageTag) { $ImageTag } else { 'ghcr.io/w9bikze8u4cbupc/mobius-preview-worker:staging-1' }  # <-- note: repo part is lowercase
$GHCR_USER = 'w9bikze8u4cbupc'    # replace with your GitHub username
$GHCR_EMAIL = 'you@example.com'    # replace with your email

# 0) quick env sanity checks
Write-Host "Checking Docker..."
try { docker version --format '.Server.Version' | Out-Null } catch { Write-Error "Docker not available or not running. Start Docker Desktop and retry."; exit 1 }
Write-Host "Docker OK."

# If dry-run, just show what would be done
if ($DryRun) {
    Write-Host "[DRY RUN] Would build Docker image $Image"
    Write-Host "[DRY RUN] Would push image $Image to GHCR"
    Write-Host "[DRY RUN] Completed successfully"
    exit 0
}

# 1) Build image locally (requires Docker running)
Write-Host "Building Docker image $Image ..."
# We already built the image, so we'll skip this step

# 2) Securely read GHCR PAT and login (interactive)
$ghcrPatSecure = Read-Host -Prompt 'Enter GHCR PAT (input hidden)' -AsSecureString
# Convert SecureString to plain for immediate use (kept in memory only)
$ptr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($ghcrPatSecure)
$ghcrPat = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($ptr)
[System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)

Write-Host "Logging in to ghcr.io (docker login)..."
# Prefer password-stdin (safer than passing on command-line). Some PowerShell environments accept this pipe.
$loginResult = $null
try {
    $loginResult = cmd.exe /c "echo $ghcrPat | docker login ghcr.io -u $GHCR_USER --password-stdin"
    if ($LASTEXITCODE -ne 0) {
        Write-Error "docker login failed"
        exit 2
    }
} catch {
    # fallback (less secure) if password-stdin fails in this shell
    Write-Warning "Password-stdin login failed in this shell; falling back to direct docker login (PAT may appear in process list)."
    docker login ghcr.io --username $GHCR_USER --password $ghcrPat
    if ($LASTEXITCODE -ne 0) {
        Write-Error "docker login failed"
        exit 2
    }
}

# 3) Push image
Write-Host "Pushing image $Image ..."
docker push $Image
if ($LASTEXITCODE -ne 0) {
    Write-Error "docker push failed"
    exit 3
}

Write-Host "Image pushed successfully to $Image"

# Clear plaintext PAT from memory variables
$ghcrPat = $null
$ghcrPatSecure.Dispose()
Write-Host "Done."