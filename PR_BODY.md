# PR Body — Guarded-rollout + staging-merge checklist (copy/paste-ready)

**Title**

Guarded rollout: Add FastAPI ingestion service + cross-platform test harness + operator runbook

**Summary**

This PR introduces a dev-grade FastAPI ingestion service (job lifecycle, WebSocket updates), cross-platform mock test harness (bash + PowerShell), operator runbook, and guarded-rollout tooling (quick-deploy.sh). It is intended for merge into the staging branch with a guarded rollout to production only after the production hardening checklist below is complete.

**What this PR contains**
- `backend/main.py` — FastAPI ingestion service (ingest endpoints, WebSocket, /health)
- `backend/requirements.txt`, `backend/Dockerfile`, `backend/run.sh`, `backend/run.ps1`
- `backend/test_api.py` — integration tests covering auth, uploads, job lifecycle, websocket
- `docker-compose.yml` — local full-stack compose for UI + backend
- **scripts** (mock harness): `backup(.sh/.ps1)`, `deploy-wrapper(.sh/.ps1)`, `notify(.sh/.ps1)`, `rollback(.sh/.ps1)`, `monitor(.sh/.ps1)`
- `PR_BODY.md`, `MOBIUS_TUTORIAL.md`, `README-TESTING.md` (operator docs + testing)
- CI job addition recommended (see gating checklist)

**Quick verification (local smoke tests)**

Start backend:
```bash
# Linux/macOS/Git Bash:
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export ALLOWED_TOKEN=your_token_here
uvicorn main:app --reload --port 8000
```

Smoke ingest (JSON):
```bash
curl -X POST "http://localhost:8000/api/ingest" \
  -H "Authorization: Bearer your_token_here" \
  -F 'metadata={"source":"local-test"}'
```

Verify WebSocket or GET `/api/status/{job_id}` to confirm status progression.

## Required gating checks (must pass before merging to staging)
- [ ] **CI**: All backend unit + integration tests pass (`pytest`), linting (`black/flake8`), and Docker image build succeed.
- [ ] **Security**: No secrets or tokens committed. `ALLOWED_TOKEN` usage limited to dev; confirm token not in commits.
- [ ] **Secrets**: CI/Env secrets configured in repository/staging secret store (do not commit `.env` with tokens).
- [ ] **Review**: Approvals from Backend Lead, Deploy Operator (@ops), and SRE/On-call.
- [ ] **Docs**: PR includes `MOBIUS_TUTORIAL.md` and `README-TESTING.md`; runbook snippets included.
- [ ] **Smoke tests**: `docker-compose up` + run quick-run smoke tests (steps documented in `MOBIUS_TUTORIAL.md`).
- [ ] **Observability**: `/health` endpoint is present and CI health checks succeed; basic structured logging enabled.

## Production hardening blockers (MUST be completed before production merge)
- [ ] Replace dev bearer token with **OAuth2/JWT + scope validation** (Backend Lead).
- [ ] Replace in-memory job store with **Redis + Celery** (or RQ) and durable task processing (Infra).
- [ ] Implement **persistent artifact storage** (S3 or DB) and retention policy.
- [ ] Add **Prometheus metrics** and readiness/liveness endpoints for orchestration.
- [ ] Add **CI workflow** that runs end-to-end UI↔backend smoke tests (or E2E harness).

*These items are allowed to remain TODO for merging into staging, but are blockers for any production rollout.*

**Guarded rollout plan (production deploy procedure - operator)**

Deploy using the one-command wrapper: `./quick-deploy.sh <image-tag> --env staging`

Activate T+60 adaptive monitoring:
- Monitor job error-rate, latency, and key Prometheus counters for the first 60 minutes.
- If error-rate > configured threshold OR latency degradation > configured threshold → **AUTO-ROLLBACK**.

Quality gates (auto rollback triggers):
- **>5%** failed ingests in 5m rolling window
- **>10%** increase in median processing latency vs baseline  
- Health endpoint returns non-200 for **>30** seconds across replicas

Rollback command (operator):
```bash
./rollback.sh --to <previous-image-sha>
```

Notifications: `deploy-wrapper` will call notify scripts; local testing writes to `notifications_out/` when external services aren't available.

## Reviewer checklist (approve only if ALL are satisfied)
- [ ] **Code**: Follows modular structure (single-responsibility modules), explicit env var usage
- [ ] **Security**: No hard-coded tokens, CORS restricted for staging domains, input validation present (Pydantic)
- [ ] **Tests**: Unit & integration tests present and deterministic; CI config added or TODO noted
- [ ] **Ops**: `quick-deploy.sh`, monitor, rollback scripts present and documented (dry-run default)
- [ ] **Docs**: `MOBIUS_TUTORIAL.md` + `README-TESTING.md` + runbook snippets included and correct
- [ ] **Observability**: `/health` present and log lines include job_id/context
- [ ] **Deployment artifacts**: `Dockerfile` and `docker-compose.yml` included and runnable locally

**Post-merge tasks (owner & timeline)**
- **Owner**: PR author (ensure artifacts and test artifacts uploaded)
- **Within 48 hours**: Backend Lead to begin OAuth2/JWT work and Redis/Celery migration (see TODOs).
- **Within 5 working days**: CI to add pipeline running integration tests + Docker smoke tests.
- **Release**: Create staged release PR to staging with rollback SHA and monitoring thresholds documented.

**Required PR metadata / labels**
- **Labels**: `staged`, `needs-ops-approval`, `backend`, `guarded-rollout`
- **Target branch**: `staging`
- **Milestone**: Release / Staging
- **Attach**: runbook PDF or link to `MOBIUS_TUTORIAL.md`, test artifacts (pytest output), Docker image tag for the deployment

---

*If you want, I will now generate the GitHub Actions CI workflow (`.github/workflows/ci.yml`) tailored to this backend (runs tests, linting, Docker build, and a smoke-test compose job). I recommend we add that next — I will create a single workflow that runs on Ubuntu/macOS/Windows matrix, installs dependencies, runs pytest, and builds the backend Docker image. Should I produce that CI workflow now?*