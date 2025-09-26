#!/bin/bash
# Premerge Orchestration Script
# Validates git state and orchestrates deployment preparation

set -euo pipefail

log() {
  echo "[PREMERGE] $(date '+%Y-%m-%d %H:%M:%S') - $*"
}

check_git_state() {
  log "Checking git repository state"
  
  # Check for uncommitted changes
  if ! git diff-index --quiet HEAD --; then
    log "ERROR: Working directory has uncommitted changes"
    git status --porcelain
    exit 1
  fi
  
  # Check for untracked files that might affect deployment
  local untracked=$(git ls-files --others --exclude-standard)
  if [ -n "$untracked" ]; then
    log "WARNING: Untracked files found:"
    echo "$untracked"
  fi
  
  log "Git state is clean"
}

validate_environment() {
  log "Validating deployment environment"
  
  # Check required environment variables
  local required_vars=("DEPLOY_ENV")
  for var in "${required_vars[@]}"; do
    if [ -z "${!var:-}" ]; then
      log "ERROR: Required environment variable $var is not set"
      exit 1
    fi
  done
  
  log "Environment validation passed"
}

run_pre_deployment_checks() {
  log "Running pre-deployment checks"
  
  # Run tests if test command exists
  if npm run test --if-present; then
    log "Tests passed"
  else
    log "ERROR: Tests failed"
    exit 1
  fi
  
  # Run linting if available
  if npm run lint --if-present; then
    log "Linting passed"
  fi
  
  log "Pre-deployment checks completed"
}

main() {
  log "Starting premerge orchestration"
  
  check_git_state
  validate_environment
  run_pre_deployment_checks
  
  log "Premerge orchestration completed successfully"
  echo "GIT_COMMIT=$(git rev-parse HEAD)" >> $GITHUB_OUTPUT 2>/dev/null || true
  echo "GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD)" >> $GITHUB_OUTPUT 2>/dev/null || true
}

main "$@"
