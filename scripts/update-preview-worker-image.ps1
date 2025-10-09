# Script to update the preview worker image in Kubernetes manifests

param(
    [Parameter(Mandatory=$true)]
    [string]$ImageTag
)

Write-Host "Updating preview worker image to: $ImageTag" -ForegroundColor Green

# Read the deployment file
$deploymentFile = "k8s/preview-worker/deployment.yaml"
$content = Get-Content $deploymentFile -Raw

# Replace the placeholder image with the provided image tag
$updatedContent = $content -replace "ghcr.io/your-org/mobius-preview-worker:latest", $ImageTag

# Write the updated content back to the file
$updatedContent | Set-Content $deploymentFile

Write-Host "Image updated successfully!" -ForegroundColor Green

# Show the change
Write-Host "Updated deployment.yaml:" -ForegroundColor Yellow
Select-String -Path $deploymentFile -Pattern "image:"

Write-Host ""
Write-Host "Pre-commit checklist:" -ForegroundColor Cyan
Write-Host "1. Run: git status"
Write-Host "2. Run: git diff -- k8s/preview-worker/"
Write-Host "3. Run tests: npm ci; npm run test:preview-payloads; npm test"
Write-Host "4. Check for secrets: git diff --staged"
Write-Host "5. Validate manifests: kubectl apply --dry-run=client -f k8s/preview-worker/"