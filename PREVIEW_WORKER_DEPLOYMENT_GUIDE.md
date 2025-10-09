# Preview Worker Deployment Guide

This guide explains how to deploy the Preview Worker to a Kubernetes cluster with proper configuration and testing.

## Prerequisites

- Kubernetes cluster access (kubectl configured)
- Docker (for building images locally)
- Registry access for pushing images
- GitHub CLI (gh) for PR creation (optional)
- sed, grep, or perl for image tag replacement

## Step 1: Build and Push the Container Image

### Option A: Build locally

```bash
# Build the image
docker build -t YOUR_REGISTRY/mobius-preview-worker:1.0.0 -f Dockerfile .

# Push the image
docker push YOUR_REGISTRY/mobius-preview-worker:1.0.0
```

### Option B: Use GitHub Actions

The CI workflow will automatically build and push images on merge to main branch.

## Step 2: Update Image Tag in Manifests

### Using the provided scripts:

#### Bash (Unix/Linux/macOS):
```bash
# Update the image tag
./scripts/update-preview-worker-image.sh YOUR_REGISTRY/mobius-preview-worker:1.0.0
```

#### PowerShell (Windows):
```powershell
# Update the image tag
.\scripts\update-preview-worker-image.ps1 -ImageTag "YOUR_REGISTRY/mobius-preview-worker:1.0.0"
```

### Manual update (cross-platform safe methods):

#### Using grep and sed (Linux):
```bash
IMAGE="YOUR_REGISTRY/mobius-preview-worker:1.0.0"
grep -rl "ghcr.io/your-org/mobius-preview-worker:latest" k8s/preview-worker/ \
  | xargs -I{} sed -i "s|ghcr.io/your-org/mobius-preview-worker:latest|${IMAGE}|g" {}
```

#### Using grep and sed (macOS):
```bash
IMAGE="YOUR_REGISTRY/mobius-preview-worker:1.0.0"
grep -rl "ghcr.io/your-org/mobius-preview-worker:latest" k8s/preview-worker/ \
  | xargs -I{} sed -i '' "s|ghcr.io/your-org/mobius-preview-worker:latest|${IMAGE}|g" {}
```

#### Using Perl (cross-platform):
```bash
IMAGE="YOUR_REGISTRY/mobius-preview-worker:1.0.0"
grep -rl "ghcr.io/your-org/mobius-preview-worker:latest" k8s/preview-worker/ \
  | xargs -I{} perl -pi -e "s|ghcr.io/your-org/mobius-preview-worker:latest|${IMAGE}|g" {}
```

## Step 3: Pre-Commit Safety Checks

Before committing changes, run these validation steps:

```bash
# Check what files changed
git status
git diff -- k8s/preview-worker/

# Run tests
npm ci
npm run test:preview-payloads
npm test

# Run linter if present
npm run lint --if-present

# Check for accidentally committed secrets
git diff --staged

# Validate manifests syntax
kubectl apply --dry-run=client -f k8s/preview-worker/
```

## Step 4: Commit and Create PR

```bash
# Commit the changes
git add k8s/preview-worker/deployment.yaml
git commit -m "chore(k8s): update preview worker image to YOUR_REGISTRY/mobius-preview-worker:1.0.0"

# Push the branch
git push origin your-branch-name

# Create PR using GitHub CLI
gh pr create --title "k8s: preview-worker manifests" \
  --body-file PR_BODY_PREVIEW_WORKER_FINAL.md --base main --head your-branch-name
```

If gh is not installed or authenticated, create the PR via the GitHub web UI.

## Step 5: Configure Environment-Specific Settings

### Update Redis Connection

Edit `k8s/preview-worker/configmap.yaml` and update the Redis URL:
```yaml
REDIS_URL: "redis://your-redis-host:6379"
```

### Create Secrets

Create a secret with your Redis password:
```bash
kubectl create secret generic preview-worker-secrets \
  --from-literal=REDIS_PASSWORD=your-redis-password \
  -n preview-worker
```

## Step 6: Deploy to Staging

```bash
# Create namespace
kubectl create namespace preview-worker --dry-run=client -o yaml | kubectl apply -f -

# Apply manifests
kubectl apply -n preview-worker -f k8s/preview-worker/

# Verify deployment
kubectl -n preview-worker get all
kubectl -n preview-worker get hpa
kubectl -n preview-worker get servicemonitor
```

## Step 7: Run Smoke Tests

### Port-forward the service:
```bash
kubectl -n preview-worker port-forward svc/preview-worker 3000:3000 &
```

### Check health endpoint:
```bash
curl -sS http://localhost:3000/api/preview/worker/health | jq
```

### Check metrics:
```bash
curl -sS http://localhost:3000/metrics | head -n 40
```

### Submit test jobs:

#### Dry-run job:
```bash
curl -X POST http://localhost:3000/api/preview/jobs \
  -H "Content-Type: application/json" \
  -d @preview_payload_minimal.json | jq
```

#### Full job:
```bash
curl -X POST http://localhost:3000/api/preview/jobs \
  -H "Content-Type: application/json" \
  -d @preview_payload_full.json | jq
```

## Step 8: Monitor Deployment

### Check logs:
```bash
kubectl -n preview-worker logs -l app=preview-worker --tail=200 -f
```

### Check job status:
```bash
curl http://localhost:3000/api/preview/jobs/<jobId>/status
```

### Verify metrics in Prometheus:
- preview_job_started
- preview_job_completed
- preview_job_failed
- preview_job_invalid
- preview_job_dryrun
- preview_job_duration_ms

## Step 9: Staged Rollout

1. **Staging** (replicas=1, concurrency=1) - 24-48 hours smoke tests
2. **Canary production** - Route small % of jobs
3. **Gradual scale up** - Increase concurrency and replicas
4. **Full rollout** - Complete deployment

## Rollback Procedure

If issues are encountered:

```bash
# Scale to 0
kubectl -n preview-worker scale deployment/preview-worker --replicas=0

# Or rollback deployment
kubectl -n preview-worker rollout undo deployment/preview-worker
```

## Alerting

Ensure these alerts are configured:
- High failure rate: failure rate > 10% over 5m
- Queue backlog threshold: waiting jobs > X
- Worker crash loop or liveness failure

## CI/CD

The GitHub Actions workflow `.github/workflows/preview-worker-build-push.yml` will:
1. Run tests on PRs
2. Build and push images on merge to main

## Troubleshooting

### Common Issues:

1. **sed/grep not found**: Install via package manager or use the Perl command above
2. **Tests failing**: Run individual test commands to identify the specific failure
3. **gh not installed**: Create the PR in GitHub web UI or install gh with `brew install gh` (macOS) or `apt install gh` (Ubuntu)
4. **Permission denied**: Ensure you have proper Kubernetes RBAC permissions
5. **Image pull errors**: Verify the image tag and registry authentication

### Debugging Tips:

1. Check pod logs: `kubectl -n preview-worker logs -l app=preview-worker`
2. Describe pods: `kubectl -n preview-worker describe pods`
3. Check events: `kubectl -n preview-worker get events`
4. Validate config: `kubectl -n preview-worker get configmap preview-worker-config -o yaml`
5. Validate secrets: `kubectl -n preview-worker get secret preview-worker-secrets -o yaml`