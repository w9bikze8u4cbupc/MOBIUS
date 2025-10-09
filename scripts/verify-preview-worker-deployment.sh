#!/bin/bash

# Preview Worker Deployment Verification Script

set -e  # Exit on any error

echo "=== Preview Worker Deployment Verification ==="

# Configuration
NAMESPACE="preview-worker"
SERVICE_NAME="preview-worker"
DEPLOYMENT_NAME="preview-worker"
HPA_NAME="preview-worker-hpa"

echo "1. Checking if namespace exists..."
kubectl get namespace $NAMESPACE || { echo "ERROR: Namespace $NAMESPACE does not exist"; exit 1; }

echo "2. Checking deployment status..."
kubectl -n $NAMESPACE get deployment $DEPLOYMENT_NAME || { echo "ERROR: Deployment $DEPLOYMENT_NAME not found"; exit 1; }

echo "3. Checking pod status..."
kubectl -n $NAMESPACE get pods -l app=preview-worker || { echo "ERROR: No pods found for preview-worker"; exit 1; }

echo "4. Checking service status..."
kubectl -n $NAMESPACE get service $SERVICE_NAME || { echo "ERROR: Service $SERVICE_NAME not found"; exit 1; }

echo "5. Checking HPA status..."
kubectl -n $NAMESPACE get hpa $HPA_NAME || { echo "ERROR: HPA $HPA_NAME not found"; exit 1; }

echo "6. Port forwarding for health check..."
kubectl -n $NAMESPACE port-forward service/$SERVICE_NAME 3000:3000 &
PORT_FORWARD_PID=$!
sleep 5  # Give port-forward time to establish

echo "7. Checking health endpoint..."
curl -s -f http://localhost:3000/api/preview/worker/health | jq . || { echo "ERROR: Health check failed"; kill $PORT_FORWARD_PID; exit 1; }

echo "8. Checking metrics endpoint..."
curl -s -f http://localhost:3000/metrics | grep "preview_worker" || { echo "ERROR: Metrics endpoint check failed"; kill $PORT_FORWARD_PID; exit 1; }

echo "9. Cleaning up port-forward..."
kill $PORT_FORWARD_PID

echo "10. Checking ServiceMonitor..."
kubectl -n $NAMESPACE get servicemonitor $SERVICE_NAME || { echo "WARNING: ServiceMonitor not found"; }

echo "=== All checks passed! Preview Worker is deployed and healthy. ==="