param(
  [string]$ImageTag = "registry.example.com/mobius-preview-worker:1.0.0",
  [string]$Branch = "feat/preview-worker-k8s-final-image",
  [string]$K8SDir = "k8s/preview-worker"
)

Set-StrictMode -Version Latest

Write-Host "Creating branch $Branch..."
git fetch origin
git checkout -b $Branch

Write-Host "Replacing mobius-preview-worker image references with $ImageTag in $K8SDir..."
Get-ChildItem -Path $K8SDir -Filter *.yaml -Recurse | ForEach-Object {
  $path = $_.FullName
  $content = Get-Content -Raw -LiteralPath $path
  $new = [regex]::Replace($content, '\b\S*mobius-preview-worker:[^\s"\'']+\b', $ImageTag)
  if ($content -ne $new) {
    Copy-Item -LiteralPath $path -Destination ($path + ".bak") -Force
    $new | Set-Content -LiteralPath $path -Encoding UTF8
  }
}

Write-Host "Staging changes..."
git add -- $K8SDir

Write-Host "Showing staged diff (first 200 lines)..."
git --no-pager diff --staged -- $K8SDir | Select-String -Pattern '.' -Context 0,0 -AllMatches | Select-Object -First 200

if (Get-Command kubectl -ErrorAction SilentlyContinue) {
  Write-Host "Validating manifests with kubectl --dry-run=client..."
  kubectl apply --dry-run=client -f $K8SDir
} else {
  Write-Host "kubectl not found — skipping dry-run validation."
}

Write-Host "Committing changes..."
git commit -m "chore(k8s): update preview-worker image -> $ImageTag" -q -ErrorAction SilentlyContinue
if ($LASTEXITCODE -ne 0) {
  Write-Host "Nothing to commit (no changes)."
}

Write-Host "Pushing branch to origin/$Branch..."
git push -u origin $Branch

Write-Host "Cleaning up .bak files..."
Get-ChildItem -Path $K8SDir -Filter *.bak -Recurse | Remove-Item -Force

Write-Host "Done. Branch $Branch pushed. Create a PR from this branch to main and use the existing PR body file."