# Finalize Preview Worker Kubernetes Manifests with Cross-Platform Deployment Tooling

This PR finalizes the Kubernetes manifests for the Preview Worker with production-ready configurations and adds comprehensive cross-platform deployment tooling and safety measures.

## Summary of Changes

### Core Kubernetes Manifests
- Updated all Kubernetes manifests with default production values
- Added namespace to all resources
- Configured HPA with appropriate scaling parameters
- Set up ServiceMonitor for Prometheus integration
- Updated container image to `ghcr.io/your-org/mobius-preview-worker:latest`
- Configured Redis connection to `redis.default.svc.cluster.local:6379`

### Cross-Platform Deployment Tooling
- Added `scripts/update-preview-worker-image.sh` for Unix/Linux/macOS systems with GNU sed, BSD sed, and Perl fallbacks
- Added `scripts/update-preview-worker-image.ps1` for Windows PowerShell systems
- Created comprehensive `PREVIEW_WORKER_DEPLOYMENT_GUIDE.md` with platform-specific instructions
- Added `PREVIEW_WORKER_PRE_COMMIT_CHECKLIST.md` for safety validation before commits
- Added `PREVIEW_WORKER_TROUBLESHOOTING_GUIDE.md` for common issue resolution

### Safety and Validation Improvements
- Enhanced deployment guide with pre-commit safety checks
- Added secret scanning procedures to prevent accidental secret commits
- Included manifest validation steps using `kubectl apply --dry-run=client`
- Provided cross-platform compatibility for all deployment scripts
- Added comprehensive troubleshooting guide for runtime issues

## Files Modified

### Kubernetes Manifests
- `k8s/preview-worker/deployment.yaml`
- `k8s/preview-worker/configmap.yaml`
- `k8s/preview-worker/service.yaml`
- `k8s/preview-worker/hpa.yaml`
- `k8s/preview-worker/servicemonitor.yaml`
- `k8s/preview-worker/secret-example.yaml`

### Deployment Scripts
- `scripts/update-preview-worker-image.sh` (Unix/Linux/macOS)
- `scripts/update-preview-worker-image.ps1` (Windows PowerShell)

### Documentation
- `PREVIEW_WORKER_DEPLOYMENT_GUIDE.md`
- `PREVIEW_WORKER_PRE_COMMIT_CHECKLIST.md`
- `PREVIEW_WORKER_TROUBLESHOOTING_GUIDE.md`
- `PHASE_F_PREVIEW_WORKER_COMPLETE_DEPLOYMENT_READY.md`

## Cross-Platform Compatibility

### Image Tag Replacement
**Unix/Linux/macOS:**
```bash
./scripts/update-preview-worker-image.sh YOUR_REGISTRY/mobius-preview-worker:1.0.0
```

**Windows PowerShell:**
```powershell
.\scripts\update-preview-worker-image.ps1 -ImageTag "YOUR_REGISTRY/mobius-preview-worker:1.0.0"
```

### Cross-Platform Safe Manual Replacement
**Linux (GNU sed):**
```bash
IMAGE="YOUR_REGISTRY/mobius-preview-worker:1.0.0"
grep -rl "ghcr.io/your-org/mobius-preview-worker:latest" k8s/preview-worker/ \
  | xargs -I{} sed -i "s|ghcr.io/your-org/mobius-preview-worker:latest|${IMAGE}|g" {}
```

**macOS (BSD sed):**
```bash
IMAGE="YOUR_REGISTRY/mobius-preview-worker:1.0.0"
grep -rl "ghcr.io/your-org/mobius-preview-worker:latest" k8s/preview-worker/ \
  | xargs -I{} sed -i '' "s|ghcr.io/your-org/mobius-preview-worker:latest|${IMAGE}|g" {}
```

**Perl (cross-platform):**
```bash
IMAGE="YOUR_REGISTRY/mobius-preview-worker:1.0.0"
grep -rl "ghcr.io/your-org/mobius-preview-worker:latest" k8s/preview-worker/ \
  | xargs -I{} perl -pi -e "s|ghcr.io/your-org/mobius-preview-worker:latest|${IMAGE}|g" {}
```

## Pre-Commit Safety Checklist

1. Run tests:
   ```bash
   npm ci
   npm run test:preview-payloads
   npm test
   npm run lint --if-present
   ```

2. Verify changes:
   ```bash
   git status
   git diff -- k8s/preview-worker/
   ```

3. Check for secrets:
   ```bash
   git diff --staged | grep -E "PASSWORD|TOKEN|SECRET|AWS_|REDIS|REDIS_PASSWORD" || true
   ```

4. Validate manifests:
   ```bash
   kubectl apply --dry-run=client -f k8s/preview-worker/
   ```

## Deployment Instructions

1. Create the namespace:
   ```bash
   kubectl create namespace preview-worker
   ```

2. Apply the manifests:
   ```bash
   kubectl apply -f k8s/preview-worker/
   ```

3. Verify deployment:
   ```bash
   kubectl -n preview-worker get deployments
   kubectl -n preview-worker get pods
   ```

## Testing

- Health endpoint is available at `/api/preview/worker/health`
- Metrics are exposed at `/metrics`
- HPA is configured for automatic scaling (1-6 replicas)
- Cross-platform scripts validated on multiple operating systems

## Next Steps

- Replace the placeholder container image with your actual image using the cross-platform scripts
- Update Redis connection details as needed
- Add actual Redis password to the secrets
- Adjust resource limits based on your environment
- Run smoke tests using the procedures in `PREVIEW_WORKER_DEPLOYMENT_GUIDE.md`

## Post-Merge Rollout Plan

1. **Staging deploy** (replicas=1, concurrency=1)
2. **Smoke test locally**:
   ```bash
   kubectl -n preview-worker port-forward svc/preview-worker 3000:3000 &
   curl -sS http://localhost:3000/api/preview/worker/health | jq
   ```
3. **Monitor metrics**:
   - preview_job_started, preview_job_completed, preview_job_failed
   - preview_job_invalid, preview_job_dryrun
   - preview_job_duration_ms histogram
4. **Gradual scale up** based on stability and performance