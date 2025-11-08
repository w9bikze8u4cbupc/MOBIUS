# Phase F Rollout Execution Plan

## Overview
This document contains all the commands and files needed to execute the Phase F rollout, including creating the main PR, adding the staging verification workflow, and creating the follow-up issues.

## Files Created

1. `create_phase_f_pr.sh` - Script to create the main PR for Phase F
2. `.github/workflows/staging-verify-phase-f.yml` - Staging verification workflow
3. `add_workflow_pr.sh` - Script to add and create PR for the staging workflow
4. `preview_worker_issue.md` - Issue body for Preview Worker implementation
5. `asset_uploads_issue.md` - Issue body for Asset Uploads implementation
6. `packaging_issue.md` - Issue body for Packaging implementation
7. `create_issues.sh` - Script to create all three follow-up issues

## Execution Steps

### 1. Create the PR for phase-f/preview-image-matcher

Run the following command from your repository root:

```bash
gh pr create \
  --base staging \
  --head phase-f/preview-image-matcher \
  --title "Phase F: Image Matcher UI + Preview backend stub" \
  --body-file ./pr_body.md \
  --label "feature" \
  --label "phase-f" \
  --label "needs-review" \
  --label "ready-for-staging" \
  --reviewer "developer" \
  --reviewer "ops" \
  --reviewer "team-lead" \
  --assignee "developer" \
  --web
```

### 2. Add and create PR for the staging workflow

First, ensure the workflow file exists at `.github/workflows/staging-verify-phase-f.yml`, then run:

```bash
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
```

### 3. Create the three follow-up issues

Run these commands to create the issues in the repo:

#### A) Preview Worker Issue
```bash
gh issue create --title "Preview Worker — render queued chapter previews (Phase F)" \
  --body-file ./preview_worker_issue.md \
  --assignee developer --label "feature" --label "phase-f"
```

#### B) Asset Uploads & Hashed Storage Issue
```bash
gh issue create --title "Asset uploads & hashed storage — upload endpoint + thumbnails" \
  --body-file ./asset_uploads_issue.md \
  --assignee developer --label "feature" --label "phase-f"
```

#### C) Packaging & Export Endpoint Issue
```bash
gh issue create --title "Export Packaging — create downloadable tutorial bundle (zip)" \
  --body-file ./packaging_issue.md \
  --assignee developer --label "feature" --label "phase-f" --label "packaging"
```

## Post-Execution Checklist

After running the commands:

1. Confirm PR(s) opened & reviewers assigned.
2. Confirm the staging-verify workflow PR exists and CI passes on that PR.
3. Confirm the three issues exist and are assigned to developer.
4. Run a manual dry-run of /api/preview after staging deploy and verify artifact + metric.
5. Share failing logs or artifacts if something breaks — cite requestId(s).

## Post-Merge to Staging

1. Set PREVIEW_MAX_CONCURRENCY=1, PREVIEW_QUEUE_MAX=20.
2. Ensure secrets.STAGING_API_URL is set in the repo.
3. Merge PRs and watch the staging verification workflow run.