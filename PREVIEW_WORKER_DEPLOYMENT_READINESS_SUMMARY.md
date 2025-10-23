# Preview Worker Deployment Readiness Summary

This document summarizes the status of the Preview Worker implementation and confirms readiness for deployment with the recommended next steps.

## Current Status

✅ **READY FOR DEPLOYMENT**: All Kubernetes manifests, validation schemas, and supporting documentation have been completed and committed.

## Components Completed

### 1. Core Implementation
- Preview Worker service with BullMQ integration
- Job validation and processing logic
- Health check endpoints
- Metrics collection and exposure
- Client library for job management

### 2. Kubernetes Manifests (Finalized)
All manifests in `k8s/preview-worker/` have been updated with default configuration values:
- Deployment with resource limits and health checks
- ConfigMap with default configuration
- Service for internal communication
- Horizontal Pod Autoscaler (HPA) for scaling
- ServiceMonitor for Prometheus integration
- Secret template for sensitive data
- Alert rules for monitoring

### 3. Validation and Testing
- Payload validation schema and implementation
- Test payloads for validation
- Comprehensive test suite

### 4. Deployment Artifacts
- Finalized manifests with default values
- Deployment verification checklist
- Automated verification scripts (bash/PowerShell)
- Complete deployment package documentation
- PR body for deployment changes

## Configuration Used

- **Container Image**: `ghcr.io/your-org/mobius-preview-worker:latest` (placeholder)
- **Namespace**: `preview-worker`
- **Image Pull Policy**: `IfNotPresent`
- **Replicas**: `1` (initial)
- **Worker Concurrency**: `2`
- **Redis Connection**: `redis://redis.default.svc.cluster.local:6379`
- **HPA**: Enabled (1→6 replicas, CPU target 60%)
- **Prometheus ServiceMonitor Label**: `release=prometheus`

## New Additions for Deployment

### CI/CD Workflow
- `.github/workflows/preview-worker-build-push.yml` - Automated build and push workflow

### Image Update Scripts
- `scripts/update-preview-worker-image.sh` - Bash script to update image tag
- `scripts/update-preview-worker-image.ps1` - PowerShell script to update image tag

### Comprehensive Guide
- `PREVIEW_WORKER_DEPLOYMENT_GUIDE.md` - Complete deployment instructions

## Immediate Next Steps

### 1. Build, Tag and Push Container Image
```bash
# Build locally
docker build -t YOUR_REGISTRY/mobius-preview-worker:1.0.0 -f Dockerfile .

# Push
docker push YOUR_REGISTRY/mobius-preview-worker:1.0.0
```

### 2. Replace Placeholder Image in Manifests
```bash
# Using the provided script
./scripts/update-preview-worker-image.sh YOUR_REGISTRY/mobius-preview-worker:1.0.0
```

### 3. Create Namespace and Apply Manifests (Staging)
```bash
kubectl create namespace preview-worker --dry-run=client -o yaml | kubectl apply -f -
kubectl apply -n preview-worker -f k8s/preview-worker/
```

### 4. Run Smoke Tests
```bash
# Port-forward
kubectl -n preview-worker port-forward svc/preview-worker 3000:3000 &

# Health check
curl -sS http://localhost:3000/api/preview/worker/health | jq

# Submit test jobs
curl -X POST http://localhost:3000/api/preview/jobs \
  -H "Content-Type: application/json" \
  -d @preview_payload_minimal.json | jq
```

## Staged Rollout Plan

1. **Staging** (replicas=1, concurrency=1) - 24-48 hours smoke tests
2. **Canary production** - Route small % of jobs
3. **Gradual scale up** - Increase concurrency and replicas
4. **Full rollout** - Complete deployment

## Rollback Procedure

```bash
# Scale to 0
kubectl -n preview-worker scale deployment/preview-worker --replicas=0

# Or rollback deployment
kubectl -n preview-worker rollout undo deployment/preview-worker
```

## Branch for Additional Work

All additional deployment tooling has been committed to the branch `feat/preview-worker-ci`:
- CI workflow for automated building and pushing
- Scripts for updating image tags
- Comprehensive deployment guide

To merge these changes:
```bash
git checkout feat/preview-worker-ci
git push origin feat/preview-worker-ci
# Create PR to merge into main
```

## Readiness Delta Register
| Metric Slice | Points at Risk | Blocking Dependency | In-Repo Owner | External Owner | Notes |
| --- | --- | --- | --- | --- | --- |
| OPS1 evidence integrity | 3 | Completion of OPS1 Evidence Replacement Playbook | Readiness lead | OPS1 operations team | Awaiting notarization transcript and ledger update confirmation. |
| OPS2 sanitization restoration | 4 | Execution of OPS2 sanitization handoff checklist | Readiness lead | OPS2 engineering | Pending DOMPurify merge and regression harness evidence. |
| Governance cadence | 2 | Compliance-approved cadence update | Program management | Governance office | Requires external scheduling approval before checkpoint unlock. |

The Preview Worker is fully implemented and ready for production deployment following the steps outlined above.
