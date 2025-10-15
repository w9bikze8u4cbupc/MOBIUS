# Script to finalize the Preview Worker PR with a specific image tag

param(
    [Parameter(Mandatory=$true)]
    [string]$ImageTag
)

Write-Host "Finalizing Preview Worker PR with image: $ImageTag" -ForegroundColor Green

# Create a new branch for the final changes
Write-Host "Creating new branch feat/preview-worker-k8s-final..." -ForegroundColor Yellow
git checkout -b feat/preview-worker-k8s-final

# Update the image tag in the deployment manifest
Write-Host "Updating image tag in deployment manifest..." -ForegroundColor Yellow
.\update-preview-worker-image-tag.ps1 -ImageTag $ImageTag

# Add all changes
Write-Host "Adding changes to git..." -ForegroundColor Yellow
git add k8s/preview-worker/deployment.yaml
git add update-preview-worker-image-tag.sh
git add update-preview-worker-image-tag.ps1
git add systemd/preview-worker.service

# Commit the changes
Write-Host "Committing changes..." -ForegroundColor Yellow
git commit -m "chore(k8s): finalize preview-worker manifests with image tag $ImageTag"

# Show the status
Write-Host "Branch status:" -ForegroundColor Yellow
git status

Write-Host ""
Write-Host "Ready to push and create PR!" -ForegroundColor Green
Write-Host "Run the following commands:" -ForegroundColor Cyan
Write-Host "  git push -u origin feat/preview-worker-k8s-final"
Write-Host "Then create the PR manually through the GitHub web interface:"
Write-Host "  https://github.com/w9bikze8u4cbupc/MOBIUS/pull/new/feat/preview-worker-k8s-final"