# Preview Worker Kubernetes Manifests - Infrastructure Deployment Guide

## Overview
This document provides the necessary Kubernetes manifests and deployment instructions for the preview-worker service. Since no cluster connection is currently available, this serves as a manifest-only deployment package that can be applied by your infrastructure team.

## Prerequisites

### Required Tools
- `kubectl` (v1.18 or later recommended)
- `yq` (YAML processor) - optional but recommended for validation
- Cluster access with appropriate permissions

### Required Permissions
The applying user/service account needs these permissions in the target namespace:
- `create`/`get`/`update`/`patch` for: deployments, services, configmaps, secrets
- `create`/`get`/`list`/`watch` for: pods
- `get`/`list` for: namespaces

## Manifest Files

### 1. Deployment Manifest (`deployment.yaml`)
**Location:** `k8s/preview-worker/deployment.yaml`
**Key Configuration:**
- **Image:** `YOUR_REGISTRY/mobius-preview-worker:ci` (⚠️ **REQUIRES UPDATE**)
- **Replicas:** 1
- **Resources:** 
  - Requests: 250m CPU, 512Mi memory
  - Limits: 1 CPU, 1Gi memory
- **Health Checks:**
  - Readiness: `/api/preview/worker/health` (port 3000)
  - Liveness: `/api/preview/worker/health` (port 3000)
- **Environment Variables:**
  - `NODE_ENV: production`
  - `PREVIEW_QUEUE_NAME: preview-jobs`
  - `PREVIEW_WORKER_CONCURRENCY: 2`
  - `HEALTH_PORT: 3000`

### 2. Service Manifest (`service.yaml`)
**Location:** `k8s/preview-worker/service.yaml`
**Key Configuration:**
- **Type:** ClusterIP (default)
- **Port:** 80 (exposed)
- **Target Port:** 3000 (container)
- **Selector:** `app: preview-worker`

## Pre-Deployment Checklist

### 1. Update Image Registry
**CRITICAL:** Replace the placeholder image in `deployment.yaml`:
```yaml
# CURRENT (placeholder):
image: YOUR_REGISTRY/mobius-preview-worker:ci

# UPDATE to your actual registry:
image: your-registry.com/mobius-preview-worker:1.0.0
```

### 2. Create Required ConfigMap and Secret
The deployment expects these resources to exist:
- **ConfigMap:** `preview-worker-config`
- **Secret:** `preview-worker-secrets`

Create them before deployment:
```bash
# Example ConfigMap (adjust values as needed)
kubectl create configmap preview-worker-config \
  --from-literal=LOG_LEVEL=info \
  --from-literal=MAX_CONCURRENT_JOBS=5 \
  -n preview-worker

# Example Secret (adjust values as needed)
kubectl create secret generic preview-worker-secrets \
  --from-literal=API_KEY=your-api-key \
  --from-literal=DATABASE_URL=your-database-url \
  -n preview-worker
```

### 3. Validate Manifests
Run validation before deployment:
```bash
# Basic YAML validation
for file in k8s/preview-worker/*.yaml; do
  yq eval '.' "$file" > /dev/null && echo "✓ $file valid" || echo "✗ $file invalid"
done

# Kubernetes validation (requires cluster access)
kubectl apply --dry-run=client -f k8s/preview-worker/
```

## Deployment Instructions

### Option 1: Direct Apply (Recommended)
```bash
# Create namespace
kubectl create namespace preview-worker

# Apply manifests
kubectl apply -f k8s/preview-worker/ -n preview-worker

# Wait for deployment to be ready
kubectl rollout status deployment/preview-worker -n preview-worker --timeout=5m

# Verify deployment
kubectl get pods -n preview-worker
kubectl get svc -n preview-worker
```

### Option 2: Using Generated Scripts
Use the provided deployment scripts for a more controlled deployment:
```bash
# Make script executable
chmod +x deploy-preview-worker.sh

# Run deployment
./deploy-preview-worker.sh
```

## Post-Deployment Verification

### 1. Check Pod Status
```bash
kubectl get pods -n preview-worker -o wide
kubectl describe pod -l app=preview-worker -n preview-worker
```

### 2. Check Service
```bash
kubectl get svc preview-worker -n preview-worker
kubectl describe svc preview-worker -n preview-worker
```

### 3. Check Logs
```bash
# Get pod name
POD_NAME=$(kubectl get pods -n preview-worker -l app=preview-worker -o jsonpath='{.items[0].metadata.name}')

# Check logs
kubectl logs "$POD_NAME" -n preview-worker --tail=100
```

### 4. Test Health Endpoint
```bash
# Port forward for testing
kubectl port-forward svc/preview-worker 8080:80 -n preview-worker &

# Test health endpoint
curl -s http://localhost:8080/api/preview/worker/health

# Test metrics endpoint (if available)
curl -s http://localhost:8080/metrics | head -20
```

## Rollback Instructions

If deployment issues occur, rollback using one of these methods:

### Method 1: Rollout Undo
```bash
kubectl rollout undo deployment/preview-worker -n preview-worker
kubectl rollout status deployment/preview-worker -n preview-worker --timeout=5m
```

### Method 2: Using Rollback Script
```bash
chmod +x rollback-preview-worker.sh
./rollback-preview-worker.sh
```

### Method 3: Delete and Recreate
```bash
kubectl delete -f k8s/preview-worker/ -n preview-worker
# Fix issues and re-apply
kubectl apply -f k8s/preview-worker/ -n preview-worker
```

## Troubleshooting

### Common Issues

#### 1. Image Pull Errors
```bash
# Check events
kubectl get events -n preview-worker --sort-by='.lastTimestamp'

# Common causes:
# - Incorrect registry URL
# - Missing image tag
# - Authentication issues
```

#### 2. Pod CrashLoopBackOff
```bash
# Check logs
kubectl logs -l app=preview-worker -n preview-worker --tail=200

# Check previous container logs
kubectl logs -l app=preview-worker -n preview-worker --previous

# Common causes:
# - Missing ConfigMap/Secret
# - Environment variable issues
# - Application startup errors
```

#### 3. Service Not Accessible
```bash
# Check service endpoints
kubectl get endpoints preview-worker -n preview-worker

# Check service selector matches pod labels
kubectl get pods -n preview-worker --show-labels
```

### Health Check Script
Use the provided health check script for comprehensive verification:
```bash
chmod +x health-check-preview-worker.sh
./health-check-preview-worker.sh
```

## Security Considerations

### 1. Network Policies
Consider implementing network policies to restrict traffic:
```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: preview-worker-network-policy
  namespace: preview-worker
spec:
  podSelector:
    matchLabels:
      app: preview-worker
  policyTypes:
  - Ingress
  - Egress
```

### 2. Resource Limits
The deployment includes resource limits to prevent resource exhaustion:
- CPU: 250m request, 1 limit
- Memory: 512Mi request, 1Gi limit

### 3. Security Context
Consider adding security context to the deployment:
```yaml
securityContext:
  runAsNonRoot: true
  runAsUser: 1000
  fsGroup: 2000
```

## Monitoring and Alerting

### Key Metrics to Monitor
- Pod restart count
- Resource usage (CPU/memory)
- Health check success rate
- Queue processing metrics (if applicable)

### Recommended Alerts
- High pod restart rate
- High resource usage
- Health check failures
- Deployment rollout failures

## Support

If you encounter issues during deployment:

1. **Check this guide** for common issues and solutions
2. **Use the health check script** for diagnostic information
3. **Review pod logs** for application-specific errors
4. **Contact the development team** with:
   - Error messages and logs
   - Cluster configuration details
   - Steps to reproduce the issue

## Files Summary

| File | Purpose | Status |
|------|---------|---------|
| `deployment.yaml` | Main application deployment | ✅ Ready (update image required) |
| `service.yaml` | Service exposure | ✅ Ready |
| `validate-and-prepare-manifests.sh` | Validation script | ✅ Available |
| `deploy-preview-worker.sh` | Deployment script | ✅ Generated |
| `rollback-preview-worker.sh` | Rollback script | ✅ Generated |
| `health-check-preview-worker.sh` | Health check script | ✅ Generated |

---

**Next Steps:**
1. Update the image registry in `deployment.yaml`
2. Create required ConfigMap and Secret
3. Apply manifests using provided instructions
4. Run post-deployment verification
5. Use health check script for monitoring