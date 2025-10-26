# Execution Instructions for Phase F Rollout

## PR Creation URLs

1. **Feature PR**: https://github.com/w9bikze8u4cbupc/MOBIUS/compare/staging...phase-f/preview-image-matcher
2. **CI Workflow PR**: https://github.com/w9bikze8u4cbupc/MOBIUS/compare/staging...ci/add-phase-f-verify-workflow

## Steps to Execute

### 1. Create Feature PR
- Go to: https://github.com/w9bikze8u4cbupc/MOBIUS/compare/staging...phase-f/preview-image-matcher
- Click "Create pull request"
- Copy the content from `FEATURE_PR_BODY.md` and paste it as the PR description
- Add labels: feature, phase-f, needs-review, ready-for-staging
- Add reviewers: developer, ops, team-lead
- Add assignee: developer

### 2. Create CI Workflow PR
- Go to: https://github.com/w9bikze8u4cbupc/MOBIUS/compare/staging...ci/add-phase-f-verify-workflow
- Click "Create pull request"
- Copy the content from `CI_WORKFLOW_PR_BODY.md` and paste it as the PR description
- Add labels: ci, phase-f
- Add reviewer: ops
- Add assignee: developer

### 3. Create Issues
Create three new issues in the repository using the following files as content:
1. `ISSUE_PREVIEW_WORKER.md`
2. `ISSUE_ASSET_UPLOADS.md`
3. `ISSUE_EXPORT_PACKAGING.md`

## Verification and Monitoring
- Use `SMOKE_TESTS.md` for post-deployment verification
- Use `MONITORING_AND_ROLLBACK.md` for runbook information
- Use `REVIEWER_CHECKLIST.md` for PR review checklist

## Files Created
- FEATURE_PR_BODY.md - Content for the feature PR
- CI_WORKFLOW_PR_BODY.md - Content for the CI workflow PR
- ISSUE_PREVIEW_WORKER.md - Content for Preview Worker issue
- ISSUE_ASSET_UPLOADS.md - Content for Asset Uploads issue
- ISSUE_EXPORT_PACKAGING.md - Content for Export Packaging issue
- SMOKE_TESTS.md - Smoke tests to run after deployment
- MONITORING_AND_ROLLBACK.md - Monitoring and rollback procedures
- REVIEWER_CHECKLIST.md - Checklist for PR reviewers
- EXECUTION_INSTRUCTIONS.md - This file