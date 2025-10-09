# Script to update the preview worker image tag in Kubernetes manifests

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