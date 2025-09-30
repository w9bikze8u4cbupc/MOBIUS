#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

# === Configuration - edit if desired ===
BRANCH="${BRANCH:-ci/api-smoke-tests}"
COMMIT_MSG="ci: add containerized CI mock API, Dockerfile.ci, docker-compose.staging & smoke tests"
PR_TITLE="${PR_TITLE:-$COMMIT_MSG}"
PR_BODY_FILE="${PR_BODY_FILE:-PR_BODY.md}"
PATCH_B64="${PATCH_B64:-patch.b64}"   # if present, will be applied
VERIFY_CMD="${VERIFY_CMD:-npm run verify-clean-genesis || node scripts/verify-clean-genesis.js}"
SMOKE_SCRIPT="${SMOKE_SCRIPT:-./scripts/ci/smoke-tests.sh}"
SMOKE_URL="${SMOKE_URL:-http://localhost:5001}"
SMOKE_TIMEOUT="${SMOKE_TIMEOUT:-30}"
SMOKE_RETRIES="${SMOKE_RETRIES:-2}"
REPORT_DIR_BASE="verification-reports"
LOG_DIR="ci-run-logs"

# === Helpers ===
log() { printf '%s %s\n' "$(date --iso-8601=seconds)" "$*"; }
err() { log "ERROR: $*" >&2; }

mkdir -p "$LOG_DIR"

# 1) Run verification (fast)
log "Running repository cleanliness verification (fast mode)..."
if ! bash -lc "$VERIFY_CMD" 2>&1 | tee "$LOG_DIR/verify-output.log"; then
  err "Verification failed. See $LOG_DIR/verify-output.log. Fix issues or run detailed verification and re-run."
  exit 1
fi
log "Verification passed (fast mode)."

# record latest verification report if exists
LATEST_REPORT=$(find . -type f -path "./${REPORT_DIR_BASE}/*" -name '*.md' -print 2>/dev/null | sort -r | head -n1 || true)
if [ -n "$LATEST_REPORT" ]; then
  cp "$LATEST_REPORT" "$LOG_DIR/verification-report.md"
  log "Copied verification report to $LOG_DIR/verification-report.md"
else
  log "No verification report found in ${REPORT_DIR_BASE}; continuing."
fi

# 2) Apply base64 patch if present
if [ -f "$PATCH_B64" ]; then
  log "Found $PATCH_B64 — decoding and attempting to apply patch..."
  base64 --decode "$PATCH_B64" > "$LOG_DIR/mobius-ci.patch" || { err "Failed to decode $PATCH_B64"; exit 1; }
  # Try git apply --index first
  if git apply --index "$LOG_DIR/mobius-ci.patch"; then
    log "Patch applied via git apply --index."
  else
    err "git apply failed. Attempting git am (mbox style)..."
    if git am --signoff < "$LOG_DIR/mobius-ci.patch"; then
      log "Patch applied via git am."
    else
      err "Patch could not be applied automatically. Inspect $LOG_DIR/mobius-ci.patch and apply manually."
      exit 1
    fi
  fi
else
  log "No patch file ($PATCH_B64) found — skipping patch step."
fi

# 3) Create/check out branch, commit any staged changes
log "Preparing branch $BRANCH..."
git fetch origin --prune
git checkout -B "$BRANCH"
# Stage all changes (including added verification files if desired)
git add -A
if git diff --cached --quiet; then
  log "No staged changes to commit."
else
  git commit -m "$COMMIT_MSG"
  log "Committed staged changes."
fi

# 4) Push branch
log "Pushing branch to origin/$BRANCH..."
git push -u origin "$BRANCH"

# 5) Build container image (best-effort)
if [ -f Dockerfile.ci ]; then
  log "Building Docker image from Dockerfile.ci..."
  if docker build -f Dockerfile.ci -t mobius-api-ci:local . 2>&1 | tee "$LOG_DIR/docker-build.log"; then
    log "Docker image built successfully."
  else
    err "Docker build failed; check $LOG_DIR/docker-build.log. Continuing to next steps for diagnostics."
  fi
else
  log "Dockerfile.ci not found — skipping local build."
fi

# 6) Start compose stack (best-effort)
if [ -f docker-compose.staging.yml ] || [ -f docker-compose.yml ]; then
  COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.staging.yml}"
  if [ -f "$COMPOSE_FILE" ]; then
    log "Starting docker compose using $COMPOSE_FILE..."
    docker compose -f "$COMPOSE_FILE" up -d 2>&1 | tee "$LOG_DIR/docker-compose-up.log"
    sleep 2
  else
    log "$COMPOSE_FILE not present; skipping compose up."
  fi
else
  log "No docker-compose file detected; skipping compose up."
fi

# 7) Run smoke tests
if [ -x "$SMOKE_SCRIPT" ]; then
  log "Running smoke tests: $SMOKE_SCRIPT $SMOKE_URL $SMOKE_TIMEOUT $SMOKE_RETRIES"
  if bash -lc "$SMOKE_SCRIPT $SMOKE_URL $SMOKE_TIMEOUT $SMOKE_RETRIES" 2>&1 | tee "$LOG_DIR/smoke-tests.log"; then
    log "Smoke tests passed."
    SMOKE_EXIT=0
  else
    err "Smoke tests failed. See $LOG_DIR/smoke-tests.log"
    SMOKE_EXIT=1
  fi
else
  log "Smoke test script $SMOKE_SCRIPT not found or not executable — skipping smoke tests."
  SMOKE_EXIT=2
fi

# 8) Collect container logs if smoke tests failed
if [ "$SMOKE_EXIT" -ne 0 ]; then
  log "Collecting docker compose logs for diagnostics..."
  if docker compose -f docker-compose.staging.yml ps &>/dev/null; then
    docker compose -f docker-compose.staging.yml logs --no-log-prefix -t > "$LOG_DIR/compose-logs.log" || true
    log "Saved compose logs to $LOG_DIR/compose-logs.log"
  else
    log "Compose stack not running or compose file missing; skipping logs collection."
  fi
fi

# 9) Create PR (if not present)
if gh pr view --json number --jq '.number' 2>/dev/null | grep -q .; then
  log "A PR already exists from this branch (attempting to open a new PR will still be attempted)."
fi

if [ ! -f "$PR_BODY_FILE" ]; then
  cat > "$PR_BODY_FILE" <<'EOF'
ci: add containerized CI mock API, Dockerfile.ci, docker-compose.staging & smoke tests

Implements a comprehensive CI testing infrastructure for the MOBIUS API that validates container builds and API behavior without external dependencies or secrets.

What this PR adds
- Lightweight mock API server (src/api/ci-server.js)
- Dockerfile.ci, docker-compose.staging.yml, .dockerignore
- scripts/ci/smoke-tests.sh with retries/timeouts/logging
- .github/workflows/ci.yml update to run api-smoke-tests job
- README and developer convenience npm scripts for local testing

How to test locally
1) Build image:
   docker build -f Dockerfile.ci -t mobius-api-ci:local .
2) Start staging:
   docker compose -f docker-compose.staging.yml up -d
3) Run smoke tests:
   ./scripts/ci/smoke-tests.sh http://localhost:5001 30 2
4) Cleanup:
   docker compose -f docker-compose.staging.yml down --volumes --remove-orphans

This PR is CI-only infrastructure (mock-mode API, non-root container) and does not change production behavior.
EOF
  log "Created PR body at $PR_BODY_FILE"
fi

log "Creating GitHub PR..."
# Attempt to create a PR; if one exists, this will open a web editor; we fallback to printing instructions
if gh pr create --title "$PR_TITLE" --body-file "$PR_BODY_FILE" --base main 2>&1 | tee "$LOG_DIR/gh-pr-create.log"; then
  log "PR creation succeeded (see gh output)."
else
  err "gh pr create failed or PR already exists. Check $LOG_DIR/gh-pr-create.log"
fi

# 10) Attach verification report as PR comment (if found)
if [ -f "$LOG_DIR/verification-report.md" ]; then
  # get the latest PR number for this branch
  PR_NUM=$(gh pr list --head "$(git rev-parse --abbrev-ref HEAD)" --json number --jq '.[0].number' 2>/dev/null || true)
  if [ -n "$PR_NUM" ]; then
    gh pr comment "$PR_NUM" --body-file "$LOG_DIR/verification-report.md" || log "gh pr comment failed"
    log "Posted verification report as a comment on PR #$PR_NUM"
  else
    log "No PR number detected; please attach $LOG_DIR/verification-report.md manually to the PR."
  fi
else
  log "No verification report available to attach."
fi

log "Finish script completed. Summary logs under $LOG_DIR. Smoke tests exit code: $SMOKE_EXIT"
exit "$SMOKE_EXIT"
