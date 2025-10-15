param(
  [string]$ImageTag = "registry.example.com/mobius-preview-worker:1.0.0",
  [string]$Branch = "feat/preview-worker-k8s-final-image",
  [string]$K8SDir = "k8s/preview-worker"
)

Set-StrictMode -Version Latest

# Create the patch content
$patchContent = @"
--- a/k8s/preview-worker/deployment.yaml
+++ b/k8s/preview-worker/deployment.yaml
@@ -17,7 +17,7 @@ spec:
       containers:
       - name: preview-worker
-        image: ghcr.io/your-org/mobius-preview-worker:latest
+        image: $ImageTag
         imagePullPolicy: IfNotPresent
"@

# Save patch to temporary file
$patchFile = [System.IO.Path]::GetTempFileName()
$patchContent | Out-File -FilePath $patchFile -Encoding UTF8

Write-Host "Creating branch $Branch..."
git checkout -b $Branch

Write-Host "Applying patch to update image tag to $ImageTag..."
git apply $patchFile

# Clean up temporary patch file
Remove-Item $patchFile

Write-Host "Showing git diff of changes..."
git diff -- $K8SDir

if (Get-Command kubectl -ErrorAction SilentlyContinue) {
  Write-Host "Validating manifests with kubectl --dry-run=client..."
  kubectl apply --dry-run=client -f $K8SDir
} else {
  Write-Host "kubectl not found -- skipping dry-run validation."
}

Write-Host "Staging and committing changes..."
git add $K8SDir
git commit -m "chore(k8s): update preview-worker image -> $ImageTag" -q

Write-Host "Pushing branch to origin/$Branch..."
git push -u origin $Branch

Write-Host "Done. Branch $Branch pushed. Open a PR from this branch to main."