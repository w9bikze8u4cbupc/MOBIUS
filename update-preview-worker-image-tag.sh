#!/bin/bash

# Script to update the preview worker image tag in Kubernetes manifests

set -e  # Exit on any error

# Check if image tag is provided
if [ $# -eq 0 ]; then
    echo "Usage: $0 <image-tag>"
    echo "Example: $0 ghcr.io/your-org/mobius-preview-worker:1.0.0"
    exit 1
fi

IMAGE_TAG=$1

echo "Updating preview worker image to: $IMAGE_TAG"

# Check which sed variant is available
if sed --version >/dev/null 2>&1; then
    # GNU sed (Linux)
    echo "Using GNU sed to update image..."
    sed -i "s|ghcr.io/your-org/mobius-preview-worker:latest|${IMAGE_TAG}|g" k8s/preview-worker/deployment.yaml
elif command -v gsed >/dev/null 2>&1; then
    # GNU sed installed as gsed (macOS with Homebrew)
    echo "Using GNU sed (gsed) to update image..."
    gsed -i "s|ghcr.io/your-org/mobius-preview-worker:latest|${IMAGE_TAG}|g" k8s/preview-worker/deployment.yaml
else
    # BSD sed (macOS default)
    echo "Using BSD sed to update image..."
    sed -i '' "s|ghcr.io/your-org/mobius-preview-worker:latest|${IMAGE_TAG}|g" k8s/preview-worker/deployment.yaml
fi

echo "Image updated successfully!"

# Show the change
echo "Updated deployment.yaml:"
grep -A 2 "image:" k8s/preview-worker/deployment.yaml