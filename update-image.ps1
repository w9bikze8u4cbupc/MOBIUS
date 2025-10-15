#!/usr/bin/env pwsh
# update-image.ps1 - Simple script to update the image placeholder

$oldImage = "YOUR_REGISTRY/mobius-preview-worker:TAG"
$newImage = "ghcr.io/mobius-org/mobius-preview-worker:1.0.0"

# Update hardened deployment
$content = Get-Content .\k8s\preview-worker\hardened-deployment.yaml -Raw
$updatedContent = $content -replace $oldImage, $newImage
Set-Content -Path .\k8s\preview-worker\hardened-deployment.yaml -Value $updatedContent -NoNewline

Write-Host "✅ Updated hardened-deployment.yaml with image: $newImage"

# Verify the change
$verification = Select-String -Path .\k8s\preview-worker\hardened-deployment.yaml -Pattern "image:"
Write-Host "Verification:"
Write-Host $verification