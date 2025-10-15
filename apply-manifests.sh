#!/bin/bash

# VARIABLES (edit only if needed)
K8S_DIR="k8s/preview-worker"     # directory containing manifests to apply
NAMESPACE="preview-worker"

# Check if namespace exists, create if not
echo "Creating namespace $NAMESPACE if it doesn't exist..."
kubectl create namespace "$NAMESPACE" 2>/dev/null
if [ $? -eq 0 ]; then
    echo "Namespace $NAMESPACE created."
else
    echo "Namespace $NAMESPACE already exists or creation failed."
fi

# Apply manifests
echo "Applying manifests from $K8S_DIR to namespace $NAMESPACE ..."
kubectl -n "$NAMESPACE" apply -f "$K8S_DIR"
if [ $? -ne 0 ]; then
    echo "kubectl apply failed"
    exit 1
fi

echo "Manifests applied successfully."