#!/bin/bash

# Verify deployment status
echo "=== Preview Worker Deployment Verification ==="

# Check if Docker is running
echo "1. Checking Docker status..."
if command -v docker &> /dev/null; then
    DOCKER_VERSION=$(docker version --format '{{.Server.Version}}' 2>/dev/null)
    if [ $? -eq 0 ]; then
        echo "   Docker is running. Version: $DOCKER_VERSION"
    else
        echo "   Docker is not running."
    fi
else
    echo "   Docker is not installed."
fi

# Check if Kubernetes is configured
echo "2. Checking Kubernetes configuration..."
if command -v kubectl &> /dev/null; then
    echo "   kubectl is available."
    
    # Check if there's a current context
    CURRENT_CONTEXT=$(kubectl config current-context 2>/dev/null)
    if [ $? -eq 0 ] && [ -n "$CURRENT_CONTEXT" ]; then
        echo "   Current context: $CURRENT_CONTEXT"
    else
        echo "   No current context set."
    fi
else
    echo "   kubectl is not available or not properly configured."
fi

# Check if the image exists locally
echo "3. Checking for local Docker image..."
IMAGE_NAME="ghcr.io/w9bikze8u4cbupc/mobius-preview-worker:staging-1"
if docker images --format "{{.Repository}}:{{.Tag}}" | grep -q "$IMAGE_NAME"; then
    echo "   Image $IMAGE_NAME found locally."
else
    echo "   Image $IMAGE_NAME not found locally."
fi

# Check if Kubernetes namespace exists
echo "4. Checking for Kubernetes namespace..."
NAMESPACE="preview-worker"
if kubectl get namespace "$NAMESPACE" &>/dev/null; then
    echo "   Namespace $NAMESPACE exists."
    
    # Check if deployment exists
    DEPLOYMENTS=$(kubectl -n "$NAMESPACE" get deployments --no-headers 2>/dev/null)
    if [ $? -eq 0 ] && [ -n "$DEPLOYMENTS" ]; then
        echo "   Deployments in $NAMESPACE:"
        echo "$DEPLOYMENTS" | while read -r line; do
            echo "     $(echo "$line" | awk '{print $1}')"
        done
    else
        echo "   No deployments found in $NAMESPACE."
    fi
else
    echo "   Namespace $NAMESPACE does not exist."
fi

echo "=== Verification Complete ==="