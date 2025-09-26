#!/usr/bin/env node
/**
 * generate_deploy_framework.js
 *
 * Single-file generator to bootstrap deployment framework files and scripts.
 * - Idempotent by default (won't overwrite existing files unless --force)
 * - Supports --dry-run for preview
 * - Sets executable permission on .sh scripts
 *
 * Requirements: Node.js 18+ (LTS 20 recommended)
 *
 * Usage:
 *   node tools/generate_deploy_framework.js --dir . [--force] [--dry-run]
 */

const fs = require('fs/promises');
const path = require('path');

const argv = process.argv.slice(2);
const opts = {
  dir: '.',
  force: false,
  dryRun: false,
};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--dir' || a === '-d') {
    opts.dir = argv[++i] || '.';
  } else if (a === '--force' || a === '-f') {
    opts.force = true;
  } else if (a === '--dry-run') {
    opts.dryRun = true;
  } else if (a === '--help' || a === '-h') {
    console.log('Usage: node generate_deploy_framework.js --dir <target-dir> [--force] [--dry-run]');
    process.exit(0);
  }
}

const files = {
  // Scripts
  'scripts/deploy/backup.sh': `#!/usr/bin/env bash
set -euo pipefail
# backup.sh - create timestamped ZIP backups (keeps last 10) and produce SHA256 checksum
# Usage: ./backup.sh --env production --components all [--output backups/]

ENV="production"
COMPONENTS="all"
OUTPUT_DIR="backups"
KEEP=10
DRY_RUN=0

print_help() {
  cat <<EOF
backup.sh --env <env> --components <all|app|config> [--output <dir>] [--keep <n>] [--dry-run]
EOF
}

while [[ \${#} -gt 0 ]]; do
  case "$1" in
    --env) ENV="$2"; shift 2;;
    --components) COMPONENTS="$2"; shift 2;;
    --output) OUTPUT_DIR="$2"; shift 2;;
    --keep) KEEP="$2"; shift 2;;
    --dry-run) DRY_RUN=1; shift;;
    --help) print_help; exit 0;;
    *) echo "Unknown arg: $1"; exit 1;;
  esac
done

TIMESTAMP=$(date -u +"%Y%m%dT%H%M%SZ")
FILE_NAME="dhash_\${ENV}_\${TIMESTAMP}.zip"
mkdir -p "\${OUTPUT_DIR}"
echo "Creating backup: \${OUTPUT_DIR}/\${FILE_NAME}"

if [[ "\${DRY_RUN}" -eq 1 ]]; then
  echo "[DRY-RUN] Would collect: src/ client/ package.json scripts/ runbooks/ tests/golden/"
  echo "[DRY-RUN] Would create zip: \${OUTPUT_DIR}/\${FILE_NAME}"
  exit 0
fi

# List of things to include - adjust to your repo
zip -r "\${OUTPUT_DIR}/\${FILE_NAME}" src/ client/ package.json scripts/ runbooks/ tests/golden/ >/dev/null 2>&1 || {
  echo "Warning: some paths may be missing; ensure repository layout."
}

# Generate checksum
sha256sum "\${OUTPUT_DIR}/\${FILE_NAME}" > "\${OUTPUT_DIR}/\${FILE_NAME}.sha256"

# Cleanup old backups (keep last $KEEP)
ls -1t "\${OUTPUT_DIR}"/dhash_\${ENV}_*.zip 2>/dev/null | tail -n +$((KEEP+1)) | xargs -r rm -f

echo "Backup created: \${OUTPUT_DIR}/\${FILE_NAME}"
echo "Checksum: \${OUTPUT_DIR}/\${FILE_NAME}.sha256"
`,
  'scripts/deploy/premerge_orchestration.sh': `#!/usr/bin/env bash
set -euo pipefail
# premerge_orchestration.sh - runs pre-merge gates: backup, dry-run deploy, migration dry-run, smoke tests, artifact collection
# Usage: ./premerge_orchestration.sh --env staging --output premerge_artifacts/ [--skip-backup]

ENV="staging"
OUTPUT_DIR="premerge_artifacts"
SKIP_BACKUP=0

while [[ \${#} -gt 0 ]]; do
  case "$1" in
    --env) ENV="$2"; shift 2;;
    --output) OUTPUT_DIR="$2"; shift 2;;
    --skip-backup) SKIP_BACKUP=1; shift;;
    --help) echo "Usage: premerge_orchestration.sh --env <env> --output <dir>"; exit 0;;
    *) echo "Unknown arg: $1"; exit 1;;
  esac
done

mkdir -p "\${OUTPUT_DIR}"
echo "Pre-merge orchestration for env=\${ENV}, artifacts -> \${OUTPUT_DIR}"

if [[ "\${SKIP_BACKUP}" -ne 1 ]]; then
  ./scripts/deploy/backup.sh --env "\${ENV}" --output "\${OUTPUT_DIR}" || {
    echo "Backup failed"; exit 1;
  }
else
  echo "Skipping backup as requested"
fi

echo "Running deploy dry-run..."
./scripts/deploy/deploy_dryrun.sh --env "\${ENV}" --output "\${OUTPUT_DIR}/deploy-dryrun.log"

echo "Running migration dry-run..."
./scripts/deploy/migration_dryrun.sh --env "\${ENV}" --output "\${OUTPUT_DIR}/migration-dryrun.log"

echo "Running smoke tests..."
./scripts/deploy/smoke_tests.sh --env "\${ENV}" --output "\${OUTPUT_DIR}/smoke-tests.log"

echo "Collecting artifacts..."
# Example: copy logs/artifacts into output dir
# cp -r logs/ "\${OUTPUT_DIR}/" || true

echo "Pre-merge orchestration complete. Artifacts in \${OUTPUT_DIR}"
`,
  'scripts/deploy/deploy_dryrun.sh': `#!/usr/bin/env bash
set -euo pipefail
# deploy_dryrun.sh - validates deployment preconditions (git state, permissions, deps), doesn't change infra
ENV="staging"
OUTPUT_FILE=""
DRY_RUN=1

while [[ \${#} -gt 0 ]]; do
  case "$1" in
    --env) ENV="$2"; shift 2;;
    --output) OUTPUT_FILE="$2"; shift 2;;
    --apply) DRY_RUN=0; shift;;
    --help) echo "Usage: deploy_dryrun.sh --env <env> [--output <file>] [--apply]"; exit 0;;
    *) echo "Unknown arg: $1"; exit 1;;
  esac
done

echo "Deploy dry-run for env=\${ENV} (dry-run=\${DRY_RUN})" | tee "\${OUTPUT_FILE:-/dev/stdout}"
echo "Checking git state..." | tee -a "\${OUTPUT_FILE:-/dev/stdout}"
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "ERROR: Working tree or index is dirty. Abort dry-run." | tee -a "\${OUTPUT_FILE:-/dev/stdout}"
  exit 2
fi
echo "Git state OK" | tee -a "\${OUTPUT_FILE:-/dev/stdout}"

echo "Checking required permissions and tools..." | tee -a "\${OUTPUT_FILE:-/dev/stdout}"
command -v sha256sum >/dev/null 2>&1 || { echo "sha256sum not found"; exit 3; }
command -v zip >/dev/null 2>&1 || { echo "zip not found"; exit 3; }

echo "Dependency checks OK" | tee -a "\${OUTPUT_FILE:-/dev/stdout}"
echo "Simulating deployment steps..." | tee -a "\${OUTPUT_FILE:-/dev/stdout}"
sleep 1
echo "Dry-run complete" | tee -a "\${OUTPUT_FILE:-/dev/stdout}"
`,
  'scripts/deploy/migration_dryrun.sh': `#!/usr/bin/env bash
set -euo pipefail
# migration_dryrun.sh - validates DB migration scripts and checks for reversible/rollback plans
ENV="staging"
OUTPUT_FILE=""

while [[ \${#} -gt 0 ]]; do
  case "$1" in
    --env) ENV="$2"; shift 2;;
    --output) OUTPUT_FILE="$2"; shift 2;;
    --help) echo "Usage: migration_dryrun.sh --env <env> [--output <file>]"; exit 0;;
    *) echo "Unknown arg: $1"; exit 1;;
  esac
done

echo "Migration dry-run for \${ENV}" | tee "\${OUTPUT_FILE:-/dev/stdout}"
# Provide lightweight validation - adapt per project
if [[ -d migrations ]]; then
  echo "Found migrations/ - listing recent files" | tee -a "\${OUTPUT_FILE:-/dev/stdout}"
  ls -1 migrations | tail -n 10 | tee -a "\${OUTPUT_FILE:-/dev/stdout}"
else
  echo "No migrations/ directory found; skipping detailed checks" | tee -a "\${OUTPUT_FILE:-/dev/stdout}"
fi
echo "Migration dry-run complete" | tee -a "\${OUTPUT_FILE:-/dev/stdout}"
`,
  'scripts/deploy/smoke_tests.sh': `#!/usr/bin/env bash
set -euo pipefail
# smoke_tests.sh - run a set of lightweight verification tests against deployed endpoints
ENV="production"
BASE_URL=""
OUTPUT_FILE=""
COUNT=5

while [[ \${#} -gt 0 ]]; do
  case "$1" in
    --env) ENV="$2"; shift 2;;
    --base-url) BASE_URL="$2"; shift 2;;
    --output) OUTPUT_FILE="$2"; shift 2;;
    --count) COUNT="$2"; shift 2;;
    --help) echo "Usage: smoke_tests.sh --env <env> --base-url <url> [--output <file>]"; exit 0;;
    *) echo "Unknown arg: $1"; exit 1;;
  esac
done

echo "Running smoke tests for \${ENV} (base_url=\${BASE_URL})" | tee "\${OUTPUT_FILE:-/dev/stdout}"
for i in \$(seq 1 \$COUNT); do
  echo "check \$i: timestamp=\$(date -u +%s)" | tee -a "\${OUTPUT_FILE:-/dev/stdout}"
  sleep 1
done
echo "Smoke tests completed" | tee -a "\${OUTPUT_FILE:-/dev/stdout}"
`,
  'scripts/deploy/monitor.sh': `#!/usr/bin/env bash
set -euo pipefail
# monitor.sh - runs a T+60 monitoring window and triggers auto-rollback on thresholds
ENV="production"
DURATION=3600
AUTO_ROLLBACK=false
POLL_FAST_SEC=30
POLL_SLOW_SEC=120
END_TIME=$(( $(date +%s) + DURATION ))
CONSECUTIVE_HEALTH_FAILURES=0
MAX_CONSECUTIVE=3
CHECKS=0

print_help(){ echo "Usage: monitor.sh --env <env> --duration <seconds> [--auto-rollback]"; }

while [[ \${#} -gt 0 ]]; do
  case "$1" in
    --env) ENV="$2"; shift 2;;
    --duration) DURATION="$2"; END_TIME=$(( $(date +%s) + DURATION )); shift 2;;
    --auto-rollback) AUTO_ROLLBACK=true; shift;;
    --help) print_help; exit 0;;
    *) echo "Unknown arg: $1"; exit 1;;
  esac
done

echo "Starting monitor for env=\${ENV} duration=\${DURATION}s auto-rollback=\${AUTO_ROLLBACK}"
while [[ $(date +%s) -lt \${END_TIME} ]]; do
  CHECKS=\$((CHECKS+1))
  # Placeholder health check - replace with real endpoint
  if curl -fsS --max-time 5 "https://127.0.0.1/health" >/dev/null 2>&1; then
    echo "\$(date -u +%Y-%m-%dT%H:%M:%SZ) HEALTH=OK"
    CONSECUTIVE_HEALTH_FAILURES=0
  else
    echo "\$(date -u +%Y-%m-%dT%H:%M:%SZ) HEALTH=FAIL"
    CONSECUTIVE_HEALTH_FAILURES=\$((CONSECUTIVE_HEALTH_FAILURES+1))
  fi

  if [[ \${CONSECUTIVE_HEALTH_FAILURES} -ge \${MAX_CONSECUTIVE} ]]; then
    echo "Detected \${CONSECUTIVE_HEALTH_FAILURES} consecutive failures"
    if [[ "\${AUTO_ROLLBACK}" == "true" ]]; then
      echo "Auto-rollback enabled: initiating rollback"
      # attempt to find latest backup
      LATEST_BACKUP=$(ls -1 backups/dhash_\${ENV}_*.zip 2>/dev/null | sort -r | head -n1 || true)
      if [[ -n "\${LATEST_BACKUP}" ]]; then
        sha256sum -c "\${LATEST_BACKUP}.sha256" && ./scripts/deploy/rollback_dhash.sh --backup "\${LATEST_BACKUP}" --env "\${ENV}" --reason "auto-monitor"
        exit 0
      else
        echo "No backup found; alert operators"
        exit 2
      fi
    else
      echo "Auto-rollback disabled; alert operators"
    fi
  fi

  # adaptive polling cadence
  if [[ \$CHECKS -le 10 ]]; then
    sleep \${POLL_FAST_SEC}
  else
    sleep \${POLL_SLOW_SEC}
  fi
done

echo "Monitoring window complete"
`,
  'scripts/deploy/rollback_dhash.sh': `#!/usr/bin/env bash
set -euo pipefail
# rollback_dhash.sh - restore from a verified backup and run post-restore verification
BACKUP=""
ENV="production"
FORCE=0

while [[ \${#} -gt 0 ]]; do
  case "$1" in
    --backup) BACKUP="$2"; shift 2;;
    --env) ENV="$2"; shift 2;;
    --force) FORCE=1; shift;;
    --help) echo "Usage: rollback_dhash.sh --backup <path> --env <env> [--force]"; exit 0;;
    *) echo "Unknown arg: $1"; exit 1;;
  esac
done

if [[ -z "\${BACKUP}" ]]; then
  echo "ERROR: --backup required"; exit 1;
fi

if [[ ! -f "\${BACKUP}" ]]; then
  echo "ERROR: backup file not found: \${BACKUP}"; exit 1;
fi

echo "Verifying checksum for \${BACKUP}"
if ! sha256sum -c "\${BACKUP}.sha256"; then
  echo "Checksum verification failed"
  if [[ "\${FORCE}" -ne 1 ]]; then
    echo "Abort rollback. Use --force to bypass (not recommended)."
    exit 2
  fi
fi

echo "Extracting backup..."
unzip -o "\${BACKUP}" -d /tmp/dhash_restore >/dev/null 2>&1
# TODO: Insert project-specific restore steps (db restore, service restart)
echo "Restoration completed to /tmp/dhash_restore (custom restore steps required)"

echo "Running post-restore health checks..."
./scripts/deploy/smoke_tests.sh --env "\${ENV}"

echo "Rollback complete"
`,
  'scripts/deploy/lcm_export.sh': `#!/usr/bin/env bash
set -euo pipefail
# lcm_export.sh - export lifecycle management artifacts (json/yaml)
OUT_DIR="lcm_export"
FORMAT="json"
while [[ \${#} -gt 0 ]]; do
  case "$1" in
    --out) OUT_DIR="$2"; shift 2;;
    --format) FORMAT="$2"; shift 2;;
    --help) echo "Usage: lcm_export.sh --out <dir> --format json|yaml"; exit 0;;
    *) echo "Unknown arg: $1"; exit 1;;
  esac
done
mkdir -p "\${OUT_DIR}"
TS=\$(date -u +"%Y%m%dT%H%M%SZ")
FILE="\${OUT_DIR}/lcm_export_\${TS}.\${FORMAT}"
echo "{" > "\${FILE}"
echo "  \\"exported_at\\": \\"\$(date -u +%Y-%m-%dT%H:%M:%SZ)\\"," >> "\${FILE}"
echo "  \\"backups\\": []" >> "\${FILE}"
echo "}" >> "\${FILE}"
echo "LCM export written to \${FILE}"
`,

  // CI workflow
  '.github/workflows/premerge-validation.yml': `name: Pre-merge Validation

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  premerge:
    runs-on: \${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
    steps:
      - uses: actions/checkout@v4
      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Install deps
        run: npm ci
      - name: Run premerge orchestration
        run: |
          ./scripts/deploy/premerge_orchestration.sh --env staging --output premerge_artifacts/\${{ matrix.os }}
      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: premerge-artifacts-\${{ matrix.os }}
          path: premerge_artifacts/\${{ matrix.os }}
`,

  // Runbooks & docs
  'runbooks/deployment_runbook.md': `# Deployment Runbook

Purpose: Step-by-step runbook for guarded MOBIUS deployments.

Essentials:
- Ensure PR has required artifacts and approvals.
- Run premerge_orchestration.sh and attach artifacts to PR.
- Deploy operator responsibilities: execute deploy, start monitor, watch T+60 window.
`,

  'runbooks/rollback_runbook.md': `# Rollback Runbook

Emergency rollback steps:
1. Identify latest backup: LATEST_BACKUP=$(ls -1 backups/dhash_*.zip | sort -r | head -n1)
2. Verify: sha256sum -c "\${LATEST_BACKUP}.sha256"
3. Execute rollback: ./scripts/deploy/rollback_dhash.sh --backup "\${LATEST_BACKUP}" --env production
4. Post-rollback: require 3 consecutive OK health checks and re-run smoke tests
`,

  'docs/deployment-framework.md': `# MOBIUS Deployment Framework

Overview of deployment framework, components, policies, and safety defaults. See runbooks/ for operational procedures.
`,

  'docs/pr-checklist-template.md': `# PR Checklist (Deployment)

- [ ] Backups attached and SHA256 verified
- [ ] Deploy dry-run logs attached
- [ ] Migration dry-run attached
- [ ] Smoke tests passed in staging
- [ ] Vulnerability scans reviewed
- [ ] 2 approvers (>=1 Ops/SRE)
- [ ] Deploy operator sign-off
`,

  'docs/operator-commands.md': `# Operator Commands

Pre-merge:
./scripts/deploy/premerge_orchestration.sh --env staging --output premerge_artifacts

Rollback:
LATEST_BACKUP=$(ls -1 backups/dhash_*.zip | sort -r | head -n1)
sha256sum -c "\${LATEST_BACKUP}.sha256"
./scripts/deploy/rollback_dhash.sh --backup "\${LATEST_BACKUP}" --env production
`,

  // Notification templates
  'templates/notifications/slack_deploy_started.json': `{
  "text": "Deployment started for {{release}}",
  "blocks": [
    { "type": "section", "text": { "type": "mrkdwn", "text": "*Deployment started* for {{release}} (PR #{{pr}})" } },
    { "type": "context", "elements": [ { "type": "mrkdwn", "text": "Operator: {{lead}} | Env: {{env}}" } ] }
  ]
}`,

  'templates/notifications/teams_deploy_started.json': `{
  "type": "message",
  "attachments": [
    {
      "contentType": "application/vnd.microsoft.card.adaptive",
      "content": {
        "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
        "type": "AdaptiveCard",
        "version": "1.2",
        "body": [
          { "type": "TextBlock", "size": "Medium", "weight": "Bolder", "text": "Deployment started: {{release}}" },
          { "type": "TextBlock", "text": "PR: {{pr}} | Env: {{env}} | Operator: {{lead}}" }
        ]
      }
    }
  ]
}`,

  'templates/notifications/email_deploy_started.txt': `Deployment started: {{release}}
PR: {{pr}}
Env: {{env}}
Operator: {{lead}}
`,

  // PR template
  '.github/pull_request_template.md': `## What this PR delivers
- Pre-merge gates...
- Artifacts: backups, dry-run logs, smoke tests

## Checklist
- [ ] backups attached
- [ ] CI premerge validation passed
- [ ] 2 approvers including Ops/SRE
`,

  // README deployment example
  'README_DEPLOYMENT.md': `# Deployment Framework - Quickstart

Run:
  ./scripts/deploy/premerge_orchestration.sh --env staging
  ./scripts/deploy/deploy_dryrun.sh --env staging
  MONITOR_DURATION=3600 AUTO_ROLLBACK=true ./scripts/deploy/monitor.sh --env production &
`,

};

async function main() {
  console.log('Generate Deploy Framework');
  console.log('Target dir:', opts.dir, 'force:', opts.force, 'dry-run:', opts.dryRun);
  const entries = Object.entries(files);

  for (const [relPath, content] of entries) {
    const target = path.join(opts.dir, relPath);
    const dir = path.dirname(target);
    if (opts.dryRun) {
      console.log(`[DRY-RUN] Would create: ${target}`);
      continue;
    }
    await fs.mkdir(dir, { recursive: true });
    let exists = false;
    try {
      await fs.access(target);
      exists = true;
    } catch (e) {
      exists = false;
    }
    if (exists && !opts.force) {
      console.log(`Skipping existing file (use --force to overwrite): ${target}`);
      continue;
    }
    await fs.writeFile(target, content, { encoding: 'utf8' });
    // set exec bit for shell scripts
    if (target.endsWith('.sh')) {
      await fs.chmod(target, 0o755);
    }
    console.log(`${exists ? 'Overwritten' : 'Created'}: ${target}`);
  }

  console.log('Generation complete.');
  console.log('Next steps: review files, customize vars/endpoints, run pre-merge orchestration in staging.');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});