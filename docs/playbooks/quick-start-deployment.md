# Hardened Preview Worker Deployment - Quick Start Guide

## 🚀 Immediate Action Plan

### Step 1: Apply the Patches (Copy & Paste Commands)

```bash
# Create a new branch for the hardened manifests
git checkout -b chore/harden-preview-worker

# Apply the patches in order
git apply -p0 0001-harden-preview-worker-manifests.patch
git apply -p0 0002-add-rbac-configuration.patch  
git apply -p0 0003-add-smoke-test-script.patch

# Make the deployment script executable
chmod +x deploy-hardened-preview-worker.sh
chmod +x k8s/preview-worker/smoke-test-preview-worker.sh
```

### Step 2: Update Image Placeholder (Critical!)

```bash
# Replace with your actual registry and image tag
# macOS:
sed -i '' 's|YOUR_REGISTRY/mobius-preview-worker:TAG|registry.example.com/mobius-preview-worker:1.0.0|g' k8s/preview-worker/sa-and-scc.yaml

# Linux:
sed -i 's|YOUR_REGISTRY/mobius-preview-worker:TAG|registry.example.com/mobius-preview-worker:1.0.0|g' k8s/preview-worker/sa-and-scc.yaml

# Verify the change
grep "image:" k8s/preview-worker/sa-and-scc.yaml
```

### Step 3: Commit the Changes

```bash
git add k8s/preview-worker/
git commit -m "chore(k8s): harden preview-worker manifests (securityContext, probes, resources, SA, RBAC) and add smoke-test"

# If you updated the image, commit that too
git commit -am "chore(k8s): set image to registry.example.com/mobius-preview-worker:1.0.0"

git push --set-upstream origin chore/harden-preview-worker
```

### Step 4: Deploy to Cluster (One Command)

```bash
# Interactive deployment (recommended)
./deploy-hardened-preview-worker.sh

# Or manual steps if you prefer control:
kubectl create namespace preview-worker --dry-run=client -o yaml | kubectl apply -f -
kubectl apply -f k8s/preview-worker/sa-and-scc.yaml -n preview-worker
kubectl apply -f k8s/preview-worker/rbac.yaml -n preview-worker  # Optional
```

### Step 5: Create Required Secrets

```bash
# Create registry secret (if using private registry)
kubectl create secret docker-registry regcred \
  --docker-server=your-registry.com \
  --docker-username=your-username \
  --docker-password=your-password \
  --docker-email=your-email \
  -n preview-worker

# Create application secrets
kubectl -n preview-worker create secret generic preview-worker-secrets \
  --from-literal=REDIS_URL='redis://your-redis:6379' \
  --from-literal=SOME_API_KEY='your-api-key'
```

### Step 6: Run Smoke Test

```bash
# Run comprehensive smoke test
./k8s/preview-worker/smoke-test-preview-worker.sh

# Or manual verification:
kubectl -n preview-worker rollout status deployment/preview-worker --timeout=180s
kubectl -n preview-worker get pods -o wide
kubectl -n preview-worker get svc
```

## 🔧 Verification Commands

### Health Check
```bash
# Port forward and test
kubectl -n preview-worker port-forward svc/preview-worker 8080:5001 &
sleep 2
curl http://localhost:8080/health
kill %1
```

### Monitor Deployment
```bash
# Watch logs
kubectl -n preview-worker logs -f deployment/preview-worker

# Check events
kubectl -n preview-worker get events --sort-by='.lastTimestamp'

# Describe resources
kubectl -n preview-worker describe deployment preview-worker
kubectl -n preview-worker describe pod -l app=preview-worker
```

## 🔄 Rollback Commands

### Quick Rollback
```bash
# Rollback to previous version
kubectl -n preview-worker rollout undo deployment/preview-worker

# Check rollback status
kubectl -n preview-worker rollout status deployment/preview-worker

# View rollout history
kubectl -n preview-worker rollout history deployment/preview-worker
```

### Emergency Removal
```bash
# Delete everything (nuclear option)
kubectl delete namespace preview-worker
```

## 📊 What You Get

### Security Hardening ✅
- ServiceAccount isolation (no cluster privileges)
- Security context (non-root, read-only filesystem)
- Resource limits (prevents resource exhaustion)
- Network isolation ready
- Minimal RBAC permissions

### Operational Excellence ✅
- Health probes with proper timing
- Rolling update strategy
- Graceful termination
- Comprehensive smoke testing
- Easy rollback capability

### Production Ready ✅
- Conservative resource requests/limits
- Proper error handling
- Monitoring integration points
- Documentation and runbooks

## 📋 Files Created

| File | Purpose |
|------|---------|
| `k8s/preview-worker/sa-and-scc.yaml` | Hardened deployment + service + serviceaccount |
| `k8s/preview-worker/rbac.yaml` | Optional RBAC configuration |
| `k8s/preview-worker/smoke-test-preview-worker.sh` | Comprehensive smoke test |
| `deploy-hardened-preview-worker.sh` | Complete deployment automation |
| `0001-harden-preview-worker-manifests.patch` | Unified patch for hardened manifests |
| `0002-add-rbac-configuration.patch` | RBAC configuration patch |
| `0003-add-smoke-test-script.patch` | Smoke test script patch |

## 🚨 Critical Reminders

1. **Update Image Placeholder** - Replace `YOUR_REGISTRY/mobius-preview-worker:TAG` with your actual image
2. **Create Secrets** - Registry and application secrets are required
3. **Test in Staging First** - Always test in non-production environment
4. **Monitor After Deployment** - Watch logs and metrics post-deployment

## 🎯 Next Steps After Deployment

1. **Monitor Performance** - Adjust resource requests/limits based on actual usage
2. **Set Up Monitoring** - Integrate with Prometheus/Grafana for metrics
3. **Configure Alerts** - Set up alerts for health check failures
4. **Document Changes** - Update runbooks with your specific configurations

## 📞 Support

If you encounter issues:
1. Check the troubleshooting section in `HARDENED_DEPLOYMENT_GUIDE.md`
2. Run the smoke test script for diagnostic information
3. Check pod logs and events
4. Verify all secrets are created correctly

---

**Ready to deploy?** Start with Step 1 and follow the commands in order. The entire process should take 5-10 minutes once you have your image registry information ready.