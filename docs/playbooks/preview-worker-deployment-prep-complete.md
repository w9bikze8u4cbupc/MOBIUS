# Preview Worker Deployment Preparation Complete

This document summarizes all the work completed for Preview Worker deployment preparation and provides clear next steps for deployment.

## Work Completed

### 1. Core Implementation (Previously Completed)
- Preview Worker service with BullMQ integration
- Job validation and processing logic
- Health check endpoints
- Metrics collection and exposure
- Client library for job management

### 2. Kubernetes Manifests (Previously Completed)
- Deployment with resource limits and health checks
- ConfigMap with default configuration
- Service for internal communication
- Horizontal Pod Autoscaler (HPA) for scaling
- ServiceMonitor for Prometheus integration
- Secret template for sensitive data
- Alert rules for monitoring

### 3. Deployment Preparation (Newly Completed)
- Cross-platform image update scripts
- Comprehensive deployment guide with platform-specific instructions
- Pre-commit checklist for safety validation
- Troubleshooting guide for common issues
- Enhanced PR body highlighting cross-platform compatibility

## Files Available

### In Main Branch
- All Kubernetes manifests in `k8s/preview-worker/`
- Core implementation files in `src/worker/`
- Test files in `tests/worker/`
- Payload validation files in `scripts/`
- Existing documentation files

### In feat/preview-worker-ci Branch
All main branch files plus:

#### Deployment Scripts
- `scripts/update-preview-worker-image.sh` (Unix/Linux/macOS)
- `scripts/update-preview-worker-image.ps1` (Windows PowerShell)

#### Documentation
- `PREVIEW_WORKER_DEPLOYMENT_GUIDE.md`
- `PREVIEW_WORKER_PRE_COMMIT_CHECKLIST.md`
- `PREVIEW_WORKER_TROUBLESHOOTING_GUIDE.md`
- `PR_BODY_PREVIEW_WORKER_FINAL_ENHANCED.md`
- `PHASE_F_PREVIEW_WORKER_COMPLETE_DEPLOYMENT_READY.md`

## Next Steps for Deployment

### Option 1: Use Existing PR Body (Basic)
```bash
# Create branch and commit
git checkout -b feat/preview-worker-k8s-final
git add .
git commit -m "chore(k8s): finalize preview-worker manifests"

# Push branch
git push -u origin feat/preview-worker-k8s-final

# Create PR using existing body
gh pr create --title "k8s: preview-worker manifests (final)" \
  --body-file PR_BODY_PREVIEW_WORKER_FINAL.md \
  --base main --head feat/preview-worker-k8s-final
```

### Option 2: Use Enhanced PR Body (Cross-Platform)
```bash
# Create branch and commit
git checkout -b feat/preview-worker-k8s-enhanced
git add .
git commit -m "chore(k8s): finalize preview-worker manifests with cross-platform deployment tooling"

# Push branch
git push -u origin feat/preview-worker-k8s-enhanced

# Create PR using enhanced body
gh pr create --title "k8s: preview-worker manifests with cross-platform deployment tooling" \
  --body-file PR_BODY_PREVIEW_WORKER_FINAL_ENHANCED.md \
  --base main --head feat/preview-worker-k8s-enhanced
```

## Cross-Platform Image Update Instructions

### Unix/Linux/macOS
```bash
./scripts/update-preview-worker-image.sh YOUR_REGISTRY/mobius-preview-worker:1.0.0
```

### Windows PowerShell
```powershell
.\scripts\update-preview-worker-image.ps1 -ImageTag "YOUR_REGISTRY/mobius-preview-worker:1.0.0"
```

### Manual Cross-Platform Safe Replacement
```bash
# Linux (GNU sed)
IMAGE="YOUR_REGISTRY/mobius-preview-worker:1.0.0"
grep -rl "ghcr.io/your-org/mobius-preview-worker:latest" k8s/preview-worker/ \
  | xargs -I{} sed -i "s|ghcr.io/your-org/mobius-preview-worker:latest|${IMAGE}|g" {}

# macOS (BSD sed)
IMAGE="YOUR_REGISTRY/mobius-preview-worker:1.0.0"
grep -rl "ghcr.io/your-org/mobius-preview-worker:latest" k8s/preview-worker/ \
  | xargs -I{} sed -i '' "s|ghcr.io/your-org/mobius-preview-worker:latest|${IMAGE}|g" {}

# Perl (cross-platform)
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

## Post-Merge Deployment

### 1. Build and Push Container Image
```bash
docker build -t YOUR_REGISTRY/mobius-preview-worker:1.0.0 -f Dockerfile .
docker push YOUR_REGISTRY/mobius-preview-worker:1.0.0
```

### 2. Update Manifests with Actual Image Tag
Use one of the cross-platform methods above.

### 3. Deploy to Kubernetes
```bash
kubectl create namespace preview-worker --dry-run=client -o yaml | kubectl apply -f -
kubectl apply -n preview-worker -f k8s/preview-worker/
```

### 4. Run Smoke Tests
```bash
kubectl -n preview-worker port-forward svc/preview-worker 3000:3000 &
curl -sS http://localhost:3000/api/preview/worker/health | jq
curl -sS http://localhost:3000/metrics | head -n 40
curl -X POST http://localhost:3000/api/preview/jobs -H "Content-Type: application/json" -d @preview_payload_minimal.json | jq
```

### 5. Staged Rollout Plan
1. **Staging deploy** (replicas=1, concurrency=1) - 24-48 hours smoke tests
2. **Canary production** - Route small % of jobs
3. **Gradual scale up** - Increase concurrency and replicas
4. **Full rollout** - Complete deployment

## Monitoring and Alerting

### Enable Immediately
- Alert: High failure rate (failed/started > 10% over 5m)
- Alert: Queue backlog above threshold
- Alert: Liveness/readiness failures
- Dashboard: throughput, success rate, duration histogram, queue length

### Key Metrics to Monitor
- preview_job_started
- preview_job_completed
- preview_job_failed
- preview_job_invalid
- preview_job_dryrun
- preview_job_duration_ms histogram

The Preview Worker is now fully prepared for deployment with comprehensive tooling, documentation, and safety measures.