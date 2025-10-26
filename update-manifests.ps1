# VARIABLES (edit only if needed)
$Image = 'ghcr.io/w9bikze8u4cbupc/mobius-preview-worker:staging-1'   # <-- note: repo part is lowercase
$K8S_DIR = 'k8s/preview-worker'     # directory containing manifests to apply

# 4) Update manifests: replace first image: field occurrences under $K8S_DIR (idempotent)
Write-Host "Updating manifests in $K8S_DIR to use image $Image ..."
Get-ChildItem -Path $K8S_DIR -Recurse -Include *.yaml,*.yml | ForEach-Object {
    $file = $_.FullName
    $content = Get-Content $file -Raw
    # Replace the placeholder image with the actual image
    $updatedContent = $content -replace 'YOUR_REGISTRY/mobius-preview-worker:ci', $Image
    # Also replace any other image references
    $updatedContent = $updatedContent -replace 'ghcr.io/mobius-org/mobius-preview-worker:1.0.0', $Image
    $updatedContent | Set-Content $file
    Write-Host "Updated $file"
}

Write-Host "Manifests updated successfully."