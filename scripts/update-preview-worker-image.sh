#!/bin/bash

# Script to update the preview worker image in Kubernetes manifests

set -e  # Exit on any error

# Check if image tag is provided
if [ $# -eq 0 ]; then
    echo "Usage: $0 <image-tag>"
    echo "Example: $0 ghcr.io/your-org/mobius-preview-worker:1.0.0"
    exit 1
fi

IMAGE_TAG=$1

echo "Updating preview worker image to: $IMAGE_TAG"

# Use yq if available, otherwise use sed
if command -v yq &> /dev/null; then
    echo "Using yq to update image..."
    yq e -i ".spec.template.spec.containers[0].image = strenv(IMAGE_TAG)" k8s/preview-worker/deployment.yaml
else
    echo "yq not found, using sed to update image..."
    sed -i "s|ghcr.io/your-org/mobius-preview-worker:latest|${IMAGE_TAG}|g" k8s/preview-worker/deployment.yaml
fi

echo "Image updated successfully!"

# Show the change
echo "Updated deployment.yaml:"
grep -A 2 "image:" k8s/preview-worker/deployment.yaml