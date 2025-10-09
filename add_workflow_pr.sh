#!/bin/bash
# Add and create PR for the staging workflow patch

# Create branch for the CI/workflow changes
git checkout -b ci/add-phase-f-verify-workflow

# Stage the workflow file
git add .github/workflows/staging-verify-phase-f.yml

# Commit
git commit -m "chore(ci): add staging verify workflow for Phase F (Linux + Windows)"

# Push branch
git push --set-upstream origin ci/add-phase-f-verify-workflow

# Open PR to staging
gh pr create --base staging --head ci/add-phase-f-verify-workflow \
  --title "CI: Add staging verify workflow for Phase F" \
  --body "Adds post-deploy verification jobs (Linux + Windows) to verify Phase F preview & matcher functionality. Runs scripts/verify-phase-f.sh and .ps1. See docs/runbook-preview.md for run instructions." \
  --label "ci" --label "phase-f" --reviewer "ops" --assignee "developer" --web