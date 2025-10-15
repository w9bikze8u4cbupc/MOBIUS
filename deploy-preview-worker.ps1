# VARIABLES (edit only if needed)
$Image = 'ghcr.io/w9bikze8u4cbupc/mobius-preview-worker:staging-1'   # <-- note: repo part is lowercase
$GHCR_USER = 'w9bikze8u4cbupc'    # replace with your GitHub username
$GHCR_EMAIL = 'you@example.com'    # replace with your email
$Branch = 'chore/harden-preview-worker'
$K8S_DIR = 'k8s/preview-worker'     # directory containing manifests to apply
$Namespace = 'preview-worker'
$ImagePullSecretName = 'ghcr-regcred'

# 0) quick env sanity checks
Write-Host "Checking Docker..."
try { docker version --format '.Server.Version' | Out-Null } catch { Write-Error "Docker not available or not running. Start Docker Desktop and retry."; exit 1 }
Write-Host "Docker OK."

Write-Host "Checking kubectl connectivity..."
try {
    kubectl version --request-timeout='5s' --client=true | Out-Null
} catch {
    Write-Warning "kubectl client is available but cluster connectivity not verified. If you intend to deploy to a cluster, ensure kubectl is configured (kubectl config get-contexts)."
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
} catch {
    # fallback (less secure) if password-stdin fails in this shell
    Write-Warning "Password-stdin login failed in this shell; falling back to direct docker login (PAT may appear in process list)."
    docker login ghcr.io --username $GHCR_USER --password $ghcrPat
}

# 3) Push image
Write-Host "Pushing image $Image ..."
docker push $Image || { Write-Error "docker push failed"; exit 3 }

# 4) Update manifests: replace first image: field occurrences under $K8S_DIR (idempotent)
Write-Host "Updating manifests in $K8S_DIR to use image $Image ..."
Get-ChildItem -Path $K8S_DIR -Recurse -Include *.yaml,*.yml | ForEach-Object {
    $file = $_.FullName
    (Get-Content $file -Raw) -replace '(image:\s*)(\S+)', "`$1$Image" | Set-Content $file
    Write-Host "Updated $file"
}

# 5) Commit & push (optional) - create branch if not exists, commit changed manifests
Write-Host "Committing manifest changes to branch $Branch ..."
if (-not (git rev-parse --verify $Branch 2>$null)) {
    git checkout -b $Branch
} else {
    git checkout $Branch
}
git add $K8S_DIR
git commit -m "chore(k8s): set preview-worker image to $Image" || Write-Host "No changes to commit."
git push -u origin $Branch

# 6) Create imagePullSecret (idempotent) for GHCR using --dry-run=client | apply
Write-Host "Creating imagePullSecret $ImagePullSecretName in namespace $Namespace ..."
# Use the plain PAT variable $ghcrPat for the kubectl create. We will pipe the generated secret YAML to kubectl apply.
$secretYaml = kubectl create secret docker-registry $ImagePullSecretName `
  --docker-server=ghcr.io `
  --docker-username=$GHCR_USER `
  --docker-password=$ghcrPat `
  --docker-email=$GHCR_EMAIL `
  --namespace $Namespace --dry-run=client -o yaml

if ($LASTEXITCODE -ne 0) { Write-Error "Failed to template imagePullSecret"; exit 4 }
$secretYaml | kubectl apply -f - || { Write-Error "Applying imagePullSecret failed"; exit 5 }

# 7) Patch ServiceAccount (optional) to include imagePullSecret (safe to re-run)
$saName = 'preview-worker'   # adjust if different
Write-Host "Patching ServiceAccount $saName in namespace $Namespace to include imagePullSecret..."
kubectl -n $Namespace patch serviceaccount $saName -p "{\"imagePullSecrets\":[{\"name\":\"$ImagePullSecretName\"}]}" --dry-run=client -o yaml | kubectl apply -f - || Write-Warning "Patch may have failed (check SA name or cluster connectivity)."

# 8) Apply manifests (idempotent)
Write-Host "Applying manifests from $K8S_DIR to namespace $Namespace ..."
kubectl create namespace $Namespace 2>$null || Write-Host "Namespace $Namespace already exists or creation failed."
kubectl -n $Namespace apply -f $K8S_DIR || { Write-Error "kubectl apply failed"; exit 6 }

# 9) Wait for rollout
Write-Host "Waiting for rollout of deployment/preview-worker..."
kubectl -n $Namespace rollout status deployment/preview-worker --timeout=180s || { Write-Warning "Rollout failed or timed out. Run: kubectl -n $Namespace get pods -o wide && kubectl -n $Namespace describe pod <podname>"; }

# 10) Smoke test (run a transient curl container to check /healthz and /metrics)
Write-Host "Running smoke tests (health + metrics) using a transient curl image..."
# Use curlimages/curl which has curl
$smokeCmd = "kubectl -n $Namespace run --rm -i --restart=Never smoke-curl --image=curlimages/curl --command -- sh -c `"echo 'Checking /healthz...'; if curl -fsS http://preview-worker:8080/healthz; then echo 'healthz OK'; else echo 'healthz FAILED' >&2; exit 2; fi; echo 'Checking /metrics...'; if curl -fsS http://preview-worker:8080/metrics | head -n 5; then echo 'metrics OK'; else echo 'metrics FAILED' >&2; exit 3; fi`" 
# Use Invoke-Expression to evaluate the string (works around PowerShell quoting)
Invoke-Expression $smokeCmd
if ($LASTEXITCODE -ne 0) { Write-Warning "Smoke test failed. Get pod logs: kubectl -n $Namespace logs -l app=preview-worker --tail=200"; }

# 11) Rollback one-liner (if needed)
Write-Host "If you need to rollback: kubectl -n $Namespace rollout undo deployment/preview-worker"

# Clear plaintext PAT from memory variables
$ghcrPat = $null
$ghcrPatSecure.Dispose()
Write-Host "Done."