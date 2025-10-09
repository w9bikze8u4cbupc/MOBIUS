# How to Create the Preview Worker PR Manually

Since the GitHub CLI (`gh`) is not installed on your system, you'll need to create the PR manually through the GitHub web interface.

## Steps to Create the PR

1. **Open your web browser** and go to:
   ```
   https://github.com/w9bikze8u4cbupc/MOBIUS/pull/new/feat/preview-worker-k8s-final
   ```

2. **Fill in the PR details**:
   - **Title**: `k8s: add preview-worker manifests + cross-platform deployment tooling (BullMQ preview worker)`
   - **Description**: Copy and paste the content from `PR_BODY_PREVIEW_WORKER_COMPLETE.md`

3. **Set the branches**:
   - **Base**: `main`
   - **Compare**: `feat/preview-worker-k8s-final`

4. **Review and submit**:
   - Review the file changes
   - Click "Create pull request"

## PR Description Content

Here's the content you should use for the PR description:

```markdown
# k8s: add preview-worker manifests + cross-platform deployment tooling (BullMQ preview worker)

This PR introduces the Mobius Preview Worker (BullMQ + Redis) and all deployment, CI, observability, validation, and ops tooling required to run it safely in staging and production. It includes a strict JSON Schema validator, the worker implementation, Prometheus instrumentation + ServiceMonitor, k8s manifests and systemd example, cross-platform update/verification scripts, and CI workflows.

## What changed

### Worker code
- `src/worker/previewWorker.js` — BullMQ worker, graceful shutdown, concurrency config
- `src/worker/jobHandlers/renderPreview.js` — render handler (plugin-ready, dry-run support)
- `src/worker/previewWorkerClient.js` — enqueue helper with jobId, attempts, backoff, removeOnComplete/Fail

### Validation
- `schemas/preview-job.schema.json` — contract for preview jobs
- `scripts/validatePreviewPayload.js` (+ POSIX + PowerShell wrappers) and test fixtures

### Observability & health
- `src/worker/previewMetrics.js` — counters + duration histogram
- `/api/preview/worker/health` — health endpoint with Redis/queue checks
- `k8s/preview-worker/servicemonitor.yaml` and `alert-rule-preview-worker.yaml`

### CI & tests
- `tests/worker/*` — unit & payload validation tests
- `.github/workflows/ci-preview-worker.yml` — test/build
- `.github/workflows/preview-worker-build-push.yml` — build & push example

### Deployment & ops
- `k8s/preview-worker/`: deployment.yaml, service.yaml, configmap.yaml, secret-example.yaml, hpa.yaml, servicemonitor.yaml, alert-rule-preview-worker.yaml
- `systemd/preview-worker.service` example (moved to systemd/preview-worker.service)
- `Dockerfile` (non-root user)
- `scripts/update-preview-worker-image.sh` (POSIX) and `scripts/update-preview-worker-image.ps1` (PowerShell)
- `scripts/verify-preview-worker-deployment.{sh,ps1}`
- pre-commit checklist, BUILD_AND_DEPLOY_GUIDE.md, troubleshooting guide

### Docs & PR artifacts
- `PR_BODY_PREVIEW_WORKER_COMPLETE.md` (this PR body in repo)
- `PREVIEW_WORKER_DEPLOYMENT_GUIDE.md`
- `PREVIEW_WORKER_PRE_COMMIT_CHECKLIST.md`
- `PREVIEW_WORKER_TROUBLESHOOTING_GUIDE.md`

## Why (design decisions)

- JSON Schema + runtime ES-module validator: fail-fast invalid payloads, reduce worker runtime errors.
- BullMQ + Redis: durable queueing, retries, backoff, DLQ strategy for reliability.
- Idempotency via jobId: prevents duplicate side effects across retries/resubmits.
- Prometheus metrics + ServiceMonitor: SLO-friendly telemetry and alerting.
- Cross-platform scripts: ensure operators on POSIX and Windows can update manifests and verify deployments.
- CI & tests: prevent regressions and ensure schema/validator compatibility pre-merge.

## How to test (developer / reviewer checklist)

### Run tests locally:
```bash
npm ci
npm run test:preview-payloads
npm test
```

### Local sanity:
Start Redis locally and start the worker with documented env vars.
Enqueue a dry-run job (payload.dryRun = true); confirm:
- `/api/preview/worker/health` returns 200 and Redis connected
- `preview_jobs_dryrun_total` increments
- `renderPreview` is short-circuited

### Kubernetes dry-run:
```bash
kubectl apply --dry-run=client -f k8s/preview-worker/
```

### Staging smoke tests (after deploy):
- Enqueue a valid job → job lifecycle moves to completed (or DLQ on expected failure)
- Prometheus scrapes metrics; ServiceMonitor is discovered
- Alerts do not fire at low load

## Rollout & rollback

### Rollout: 
staging (replicas=1, concurrency=1) → canary (small subset) → full scale.
Monitor queue length, failure rate, job duration histogram at each step.

### Rollback: 
revert to previous working image tag; reprocess DLQ after fix.
Manual rollback steps documented in `PREVIEW_WORKER_TROUBLESHOOTING_GUIDE.md`.

## Production blockers (must be resolved before production)

- Replace placeholder image in k8s manifests with built image: `YOUR_REGISTRY/mobius-preview-worker:TAG`
- Provision and wire secrets (Redis password, registry creds, external service keys) into Kubernetes Secrets or a vault
- Confirm production Redis connectivity, HA, and credentials
- Tune HPA thresholds and alert thresholds against real traffic

## Files to review carefully

- `schemas/preview-job.schema.json` (required vs optional fields)
- `k8s/preview-worker/deployment.yaml` (securityContext, resource requests/limits, envFrom Secrets)
- `Dockerfile` (non-root, minimal attack surface)
- `.github/workflows/*` — ensure no secrets are leaked in workflow logs

## One-line commands / quick reference

### Run payload tests:
```bash
npm run test:preview-payloads
```

### Update manifests image (POSIX):
```bash
./scripts/update-preview-worker-image.sh YOUR_REGISTRY/mobius-preview-worker:1.0.0
```

### Update manifests image (PowerShell):
```powershell
.\scripts\update-preview-worker-image.ps1 -ImageTag "YOUR_REGISTRY/mobius-preview-worker:1.0.0"
```

### Deploy to staging:
```bash
kubectl -n preview-worker apply -f k8s/preview-worker/
```

### Health check (port-forward):
```bash
kubectl -n preview-worker port-forward deployment/preview-worker 3000:3000 &
curl localhost:3000/api/preview/worker/health
```

## Acceptance criteria (merge & production rollout)

- All CI checks pass (payload validation + unit tests)
- Health endpoint returns 200 and Redis connectivity OK in staging
- Dry-run jobs recorded and do not invoke renderPreview
- A real job completes end-to-end in staging (or lands in expected artifact generation)
- Prometheus scrapes metrics and alert rules are configured and tested in staging
- Secrets externalized; no sensitive data committed

## Risks & mitigations

- Malformed jobs reaching production → strict schema + runtime validator on enqueue and worker
- Secrets in manifests → require Kubernetes Secrets / vault and PR checks
- Unexpected high failure rate during rollout → canary staging + alerting + DLQ + quick rollback steps
```

## Next Steps

After creating the PR, the next steps are:

1. Ensure all CI checks pass
2. Request reviews from team members
3. Address any feedback
4. Merge when approved
5. Deploy to staging environment
6. Run smoke tests
7. Verify Prometheus metrics scraping
8. Test rollback procedures