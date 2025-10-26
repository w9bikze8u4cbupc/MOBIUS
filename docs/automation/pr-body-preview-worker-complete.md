# k8s: add preview-worker manifests + cross-platform deployment tooling (BullMQ preview worker)

This PR adds the Mobius Preview Worker Kubernetes manifests, deployment and systemd examples, cross-platform image update scripts, CI workflow and test hooks, JSON-schema validation, and the worker implementation wired for observability. It prepares the preview-worker for safe staging and production rollouts with clear acceptance criteria, metrics, and troubleshooting guidance.

## What changed

### Worker implementation
- `src/worker/previewWorker.js` — BullMQ worker with graceful shutdown and idempotent job handling
- `src/worker/jobHandlers/renderPreview.js` — render handler (plugin-ready; dry-run instrumentation)
- `src/worker/previewWorkerClient.js` — recommended enqueue patterns (jobId, backoff, attempts)

### Validation
- `schemas/preview-job.schema.json` — strict JSON Schema for preview jobs
- `scripts/validatePreviewPayload.js` (+ POSIX + PowerShell wrappers) and payload tests

### Observability & health
- `src/worker/previewMetrics.js` — Prometheus counters & histogram
- `/api/preview/worker/health` — health endpoint returns Redis/queue status
- `k8s/preview-worker/servicemonitor.yaml` + `k8s/preview-worker/alert-rule-preview-worker.yaml`

### CI & tests
- `tests/worker/*` — unit tests and payload validation tests
- `.github/workflows/ci-preview-worker.yml` — build/test
- `.github/workflows/preview-worker-build-push.yml` — (example) build & push

### Deployment & ops
- `k8s/preview-worker/`: deployment.yaml, service.yaml, configmap.yaml, secret-example.yaml, hpa.yaml
- `systemd/preview-worker.service` (example non-container deployment)
- `Dockerfile` for non-root worker image
- `scripts/update-preview-worker-image.sh` (POSIX) and .ps1 (PowerShell)
- `scripts/verify-preview-worker-deployment.{sh,ps1}`
- pre-commit checklist, README, BUILD_AND_DEPLOY_GUIDE.md, PHASE_F summaries

### Docs & acceptance
- `PR_BODY_PREVIEW_WORKER_FINAL_ENHANCED.md` (this file)
- `PREVIEW_WORKER_DEPLOYMENT_GUIDE.md`, `PREVIEW_WORKER_PRE_COMMIT_CHECKLIST.md`, `PREVIEW_WORKER_TROUBLESHOOTING_GUIDE.md`

## Why

- JSON Schema + runtime validator fail-fast invalid payloads and prevent wasted worker cycles.
- BullMQ + Redis provides durable queueing, retries, and DLQ handling required for reliable processing.
- Job idempotency (jobId) avoids duplicate side effects on retry.
- Prometheus-friendly metrics + ServiceMonitor enable SLO coverage and alerting.
- Cross-platform scripts ensure operators on both POSIX and Windows can safely update manifests & images.
- CI prevents regressions and enforces payload contract compatibility before deploy.

## How to test (developer / reviewer checklist)

### Run unit & validation tests:
```bash
npm ci
npm run test:preview-payloads
npm test
```

### Local sanity:
Start Redis locally and run worker (env vars documented in README)
Enqueue a dry-run job (payload.dryRun = true) and confirm:
- `/api/preview/worker/health` returns 200 with Redis connected
- Metrics increment preview_jobs_dryrun_total
- renderPreview is short-circuited for dry-run

### k8s dry-run:
```bash
kubectl apply --dry-run=client -f k8s/preview-worker/
```

### Smoke test in staging (after deploy):
- Enqueue a valid job; verify job lifecycle: started → completed (or failed with DLQ)
- Verify Prometheus scrapes metrics and ServiceMonitor is discovered
- Ensure alerts do not fire at low load

## Rollout & rollback

### Rollout: 
staging (replicas=1, concurrency=1) → canary (replicas small) → scale to target
At each stage: monitor queue length, failure rate, histogram of job duration

### Rollback: 
revert deployment image to previous working tag; reprocess DLQ after fix
Manual rollback steps documented in `PREVIEW_WORKER_TROUBLESHOOTING_GUIDE.md`

## Production blockers (must be resolved before production)

- Replace image placeholder in k8s manifests with the pushed image: `YOUR_REGISTRY/mobius-preview-worker:TAG`
- Provision and wire secrets (Redis password, registry creds, external service keys) into Kubernetes Secrets or a vault
- Confirm Redis production connectivity and HA/credentials
- Tune HPA thresholds and alert thresholds to real traffic volumes

## Files to review carefully

- `schemas/preview-job.schema.json` (strictness, optional vs required fields)
- `k8s/preview-worker/deployment.yaml` (securityContext, resource limits, envFrom Secrets)
- `Dockerfile` (security/non-root user)
- CI workflows (`.github/workflows`) for secrets usage (do not leak creds)

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

## Suggested git flow to finalize and open PR (already tested locally)

```bash
# create feature branch and replace image tag in manifests (or run the script)
git checkout -b feat/preview-worker-k8s-final
./scripts/update-preview-worker-image.sh YOUR_REGISTRY/mobius-preview-worker:1.0.0

# commit manifests & docs
git add k8s/preview-worker scripts PREVIEW_WORKER_*.md
git commit -m "chore(k8s): finalize preview-worker manifests and cross-platform ops"

# push branch and open PR (example using GitHub CLI)
git push -u origin feat/preview-worker-k8s-final
gh pr create --title "k8s: preview-worker manifests with cross-platform deployment tooling" \
  --body-file PR_BODY_PREVIEW_WORKER_FINAL_ENHANCED.md --base main --head feat/preview-worker-k8s-final
```

## Acceptance criteria (for merging & production rollout)

- All CI checks pass (payload validation + unit tests)
- Health endpoint returns 200 and Redis connectivity is OK in staging
- Dry-run jobs recorded and do not call renderPreview
- A real job completes end-to-end in staging (or reaches expected artifact generation step)
- Prometheus scrapes metrics and alert rules configured (tested in staging)
- Secrets are externalized; no sensitive data committed

## Risks & mitigations

- **Risk**: Malformed jobs bypass checks → **Mitigation**: strict JSON Schema + runtime validator early in enqueue & worker
- **Risk**: Secrets leaked in manifests → **Mitigation**: use kubernetes Secret and validate in PR review
- **Risk**: High failure rate during rollout → **Mitigation**: canary staged rollout + alerting + DLQ