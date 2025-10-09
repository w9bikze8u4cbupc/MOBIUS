#!/bin/bash

# Script to finalize the Preview Worker PR with a specific image tag

set -e  # Exit on any error

# Check if image tag is provided
if [ $# -eq 0 ]; then
    echo "Usage: $0 <image-tag>"
    echo "Example: $0 ghcr.io/your-org/mobius-preview-worker:1.0.0"
    exit 1
fi

IMAGE_TAG=$1

echo "Finalizing Preview Worker PR with image: $IMAGE_TAG"

# Create a new branch for the final changes
echo "Creating new branch feat/preview-worker-k8s-final..."
git checkout -b feat/preview-worker-k8s-final

# Update the image tag in the deployment manifest
echo "Updating image tag in deployment manifest..."
./update-preview-worker-image-tag.sh "$IMAGE_TAG"

# Add all changes
echo "Adding changes to git..."
git add k8s/preview-worker/deployment.yaml
git add update-preview-worker-image-tag.sh
git add update-preview-worker-image-tag.ps1
git add systemd/preview-worker.service

# Commit the changes
echo "Committing changes..."
git commit -m "chore(k8s): finalize preview-worker manifests with image tag $IMAGE_TAG"

# Show the status
echo "Branch status:"
git status

echo ""
echo "Ready to push and create PR!"
echo "Run the following commands:"
echo "  git push -u origin feat/preview-worker-k8s-final"
echo "  gh pr create --title \"k8s: add preview-worker manifests + cross-platform deployment tooling (BullMQ preview worker)\" \\"
echo "    --body-file PR_BODY_PREVIEW_WORKER_COMPLETE.md --base main --head feat/preview-worker-k8s-final"