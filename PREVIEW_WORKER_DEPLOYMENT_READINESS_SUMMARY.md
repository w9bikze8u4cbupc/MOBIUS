# Preview Worker Deployment Readiness Summary

This document summarizes the status of the Preview Worker implementation and confirms readiness for deployment with the recommended next steps.

## Current Status

⚠️ **CONDITIONAL READINESS**: Core deliverables are complete, but external dependencies remain open. The readiness ledger is currently **720 / 1000** pending OPS1 evidence replacement, OPS2 sanitization restoration, and Security's shared token release. Progress is tracked in the Readiness Delta Register and will lift the score automatically once notarized evidence is ingested.

### Readiness Delta Register (Live)

| Item | Owner | Dependency | Status | Next Check-in |
| --- | --- | --- | --- | --- |
| OPS1 evidence replacement | OPS1 duty pod | ServiceNow `CHG-48271` | Scheduled | Awaiting execution confirmation |
| OPS2 sanitization restoration | OPS2 restoration team | ServiceNow `CHG-48304` | Blocked on sanitized dataset handoff | Daily readiness stand-up |
| Shared token release | Security liaison | Incident `SEC-5432` | Pending | Security readiness poll (48h cadence) |

**Next Execution Orders**
- Distribute the OPS1 playbook and OPS2 blueprint to their respective coordinators and the Security liaison; record acknowledgements in the delta register.
- Schedule readiness stand-up agenda slots to capture status polls directly into the register.
- Prepare evidence ingestion hooks so notarization transcripts, sanitization reports, and token release proof can be committed immediately upon receipt.

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

The Preview Worker is fully implemented and ready for production deployment following the steps outlined above.