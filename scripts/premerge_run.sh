#!/usr/bin/env bash
set -euo pipefail

# scripts/premerge_run.sh
# Automates pre-merge workflow:
#   - Rebase check
#   - Backup creation + SHA256 verification
#   - deploy dry-run (staging)
#   - migration dry-run
#   - logging + smoke tests
#   - collect artifacts
#
# Usage:
#   ARTIFACT_DIR=ci_artifacts AUTO_CREATE_PR=false ./scripts/premerge_run.sh
#
# Environment variables (all optional; safe defaults provided):
#   HEAD_BRANCH         (default: current checked-out branch)
#   BASE_BRANCH         (default: origin/main)
#   BACKUP_DIR          (default: backups)
#   ARTIFACT_DIR        (default: premerge_artifacts)
#   DRY_RUN_ENV         (default: staging)
#   AUTO_CREATE_PR      (default: false) -- if true, runs CREATE_PR_COMMAND.txt
#   CREATE_PR_CMD_FILE  (default: CREATE_PR_COMMAND.txt)
#   LOG_DIR             (default: logs)
#   CI_UPLOAD_CMD       (optional) command to upload ARTIFACT_DIR to CI artifact storage
#   SKIP_SMOKE          (default: false) to skip smoke tests (not recommended)
# Exit codes:
#   0 success, 10..50 failure categories as noted above.

HEAD_BRANCH="${HEAD_BRANCH:-$(git rev-parse --abbrev-ref HEAD)}"
BASE_BRANCH="${BASE_BRANCH:-origin/main}"
BACKUP_DIR="${BACKUP_DIR:-backups}"
ARTIFACT_DIR="${ARTIFACT_DIR:-premerge_artifacts}"
DRY_RUN_ENV="${DRY_RUN_ENV:-staging}"
AUTO_CREATE_PR="${AUTO_CREATE_PR:-false}"
CREATE_PR_CMD_FILE="${CREATE_PR_CMD_FILE:-CREATE_PR_COMMAND.txt}"
LOG_DIR="${LOG_DIR:-logs}"
SKIP_SMOKE="${SKIP_SMOKE:-false}"

mkdir -p "$BACKUP_DIR" "$ARTIFACT_DIR" "$LOG_DIR"

echo "Pre-merge runner starting"
echo "HEAD_BRANCH=$HEAD_BRANCH BASE_BRANCH=$BASE_BRANCH DRY_RUN_ENV=$DRY_RUN_ENV"
echo "ARTIFACT_DIR=$ARTIFACT_DIR BACKUP_DIR=$BACKUP_DIR AUTO_CREATE_PR=$AUTO_CREATE_PR"

# 1) Verify working tree and rebase state
echo "1) Checking git state..."
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Working tree has uncommitted changes. Commit or stash before running." >&2
  exit 10
fi

# Ensure HEAD branch exists locally
if ! git show-ref --verify --quiet "refs/heads/$HEAD_BRANCH"; then
  echo "Local branch $HEAD_BRANCH not found. Checkout or set HEAD_BRANCH env var." >&2
  exit 10
fi

# Rebase onto latest base
echo "Fetching origin..."
git fetch origin --quiet
echo "Rebasing $HEAD_BRANCH onto $BASE_BRANCH..."
if ! git rebase "$BASE_BRANCH"; then
  echo "Rebase failed. Resolve conflicts and re-run." >&2
  exit 10
fi

# 2) Create verified backup
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_FN="${BACKUP_DIR}/dhash_${TIMESTAMP}.zip"
BACKUP_SHA="${BACKUP_FN}.sha256"
echo "2) Creating backup -> $BACKUP_FN"
if ! ./scripts/backup_library.sh --out "$BACKUP_FN"; then
  echo "Backup creation failed" >&2
  exit 20
fi

echo "Generating SHA256 checksum..."
sha256sum "$BACKUP_FN" > "$BACKUP_SHA"

echo "Verifying checksum..."
if ! sha256sum -c "$BACKUP_SHA" >/dev/null 2>&1; then
  echo "Backup verification failed" >&2
  ls -l "$BACKUP_FN" "$BACKUP_SHA" || true
  exit 20
fi
echo "Backup verified: $BACKUP_FN"

# 3) Deploy dry-run (staging) and capture logs
DEPLOY_DRYRUN_LOG="${LOG_DIR}/deploy-dryrun-${TIMESTAMP}.log"
MIGRATE_DRYRUN_LOG="${LOG_DIR}/migrate-dryrun-${TIMESTAMP}.log"
echo "3) Running deploy dry-run (env: $DRY_RUN_ENV) -> $DEPLOY_DRYRUN_LOG"
if ! ./scripts/deploy_dhash.sh --dry-run --env "$DRY_RUN_ENV" > "$DEPLOY_DRYRUN_LOG" 2>&1; then
  echo "Deploy dry-run failed. See $DEPLOY_DRYRUN_LOG" >&2
  exit 30
fi

echo "Running migration dry-run -> $MIGRATE_DRYRUN_LOG"
if ! node scripts/migrate-dhash.js --dry-run > "$MIGRATE_DRYRUN_LOG" 2>&1; then
  echo "Migration dry-run failed. See $MIGRATE_DRYRUN_LOG" >&2
  exit 30
fi

# 4) Smoke & logging tests
TEST_LOG="${LOG_DIR}/tests-${TIMESTAMP}.log"
if [ "$SKIP_SMOKE" = "true" ]; then
  echo "Skipping smoke tests (SKIP_SMOKE=true)"
  echo "Smoke tests skipped" > "$TEST_LOG"
else
  echo "4) Running logging test and smoke tests -> $TEST_LOG"
  if ! node scripts/test_logging.js >> "$TEST_LOG" 2>&1; then
    echo "Logging validation failed. See $TEST_LOG" >&2
    exit 40
  fi

  if ! node scripts/smoke-tests.js --quick >> "$TEST_LOG" 2>&1; then
    echo "Smoke tests failed. See $TEST_LOG" >&2
    exit 40
  fi
fi

# 5) Collect artifacts for PR attachment / CI upload
echo "5) Collecting artifacts into $ARTIFACT_DIR"
cp "$BACKUP_FN" "$BACKUP_SHA" "$DEPLOY_DRYRUN_LOG" "$MIGRATE_DRYRUN_LOG" "$TEST_LOG" "$ARTIFACT_DIR"/ 2>/dev/null || true

# Save metadata
echo "{\"branch\": \"$HEAD_BRANCH\", \"timestamp\": \"$TIMESTAMP\", \"base_branch\": \"$BASE_BRANCH\", \"dry_run_env\": \"$DRY_RUN_ENV\"}" > "${ARTIFACT_DIR}/premerge_meta_${TIMESTAMP}.json"

# Optionally upload artifacts (CI uploader command provided via CI_UPLOAD_CMD)
if [ -n "${CI_UPLOAD_CMD:-}" ]; then
  echo "Uploading artifacts via CI_UPLOAD_CMD"
  eval "$CI_UPLOAD_CMD" || echo "CI_UPLOAD_CMD failed; artifacts remain in $ARTIFACT_DIR"
fi

# 6) Optionally create PR (disabled by default)
if [ "$AUTO_CREATE_PR" = "true" ]; then
  if [ -f "$CREATE_PR_CMD_FILE" ]; then
    echo "AUTO_CREATE_PR=true - executing $CREATE_PR_CMD_FILE"
    # Run the create command in a subshell so that environment vars aren't polluted
    ( set -o pipefail; bash -c "source $CREATE_PR_CMD_FILE" ) || {
      echo "PR creation command failed" >&2
      # not a blocking failure for premerge; leave as non-zero if you prefer
      exit 1
    }
  else
    echo "AUTO_CREATE_PR=true but $CREATE_PR_CMD_FILE not found. Skipping PR creation." >&2
  fi
fi

echo "Pre-merge run completed successfully. Artifacts in $ARTIFACT_DIR"
echo "Backup: $BACKUP_FN"
echo "Backup SHA: $BACKUP_SHA"

exit 0