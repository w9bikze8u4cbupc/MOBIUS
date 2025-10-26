#!/bin/bash

# VARIABLES (edit only if needed)
IMAGE="ghcr.io/w9bikze8u4cbupc/mobius-preview-worker:staging-1"  # <-- note: repo part is lowercase
K8S_DIR="k8s/preview-worker"     # directory containing manifests to apply

# 4) Update manifests: replace first image: field occurrences under $K8S_DIR (idempotent)
echo "Updating manifests in $K8S_DIR to use image $IMAGE ..."

# Find all yaml/yml files and update them
find "$K8S_DIR" -type f \( -name "*.yaml" -o -name "*.yml" \) -exec sed -i.bak \
  -e "s|YOUR_REGISTRY/mobius-preview-worker:ci|$IMAGE|g" \
  -e "s|ghcr.io/mobius-org/mobius-preview-worker:1.0.0|$IMAGE|g" {} \;

# Remove backup files
find "$K8S_DIR" -type f -name "*.bak" -delete

echo "Updated manifests in $K8S_DIR"
echo "Manifests updated successfully."