# Phase F Rollout Status

## Branches Created and Pushed

1. **Feature Branch**: [phase-f/preview-image-matcher](https://github.com/w9bikze8u4cbupc/MOBIUS/tree/phase-f/preview-image-matcher)
   - Contains all Phase F implementation
   - Already pushed to remote repository

2. **CI Workflow Branch**: [ci/add-phase-f-verify-workflow](https://github.com/w9bikze8u4cbupc/MOBIUS/tree/ci/add-phase-f-verify-workflow)
   - Contains staging verification workflow
   - Already pushed to remote repository

## Next Steps

### 1. Create Pull Requests

#### Feature PR
- **Base**: staging
- **Head**: phase-f/preview-image-matcher
- **Title**: "Phase F: Image Matcher UI + Preview backend stub"
- **Description**: Use content from pr_body.md
- **Labels**: feature, phase-f, needs-review, ready-for-staging
- **Reviewers**: developer, ops, team-lead
- **Assignee**: developer

#### CI Workflow PR
- **Base**: staging
- **Head**: ci/add-phase-f-verify-workflow
- **Title**: "CI: Add staging verify workflow for Phase F"
- **Description**: Adds post-deploy verification jobs (Linux + Windows) to verify Phase F preview and matcher functionality. Runs scripts/verify-phase-f.sh and .ps1. See docs/runbook-preview.md for run instructions.
- **Labels**: ci, phase-f
- **Reviewers**: ops
- **Assignee**: developer

### 2. Create Follow-up Issues

Three issues need to be created manually:

1. **Preview Worker Implementation**
2. **Asset Uploads & Hashed Storage**
3. **Packaging & Export Endpoint**

Use the detailed descriptions from the CREATE_PR_AND_ISSUES.ps1 script output.

### 3. Post-Merge Staging Steps

After PRs are merged:

1. Set environment variables:
   - PREVIEW_MAX_CONCURRENCY=1
   - PREVIEW_QUEUE_MAX=20
   - Ensure DATA_DIR is writable by the service user
   - Ensure secrets.STAGING_API_URL exists and points to the staging API base

2. Deploy staging (your normal process)

3. Watch the staging verify workflow run:
   - Runs scripts/verify-phase-f.sh on Linux runner
   - Runs scripts/verify-phase-f.ps1 on Windows runner
   - Uploads logs to artifacts on failure

### 4. Manual Smoke Tests

After staging deploy:

1. Dry-run preview via curl:
   ```
   curl -X POST "https://staging.example.com/api/preview?dryRun=true" \
     -H "Content-Type: application/json" \
     -H "x-api-version: v1" \
     -d '{"projectId":"smoke","chapterId":"c1","chapter":{"title":"smoke","steps":[{"id":"s1","title":"t","body":"b"}]}}'
   ```

2. Expected: HTTP 202 JSON with { status: "dry_run" | "queued", jobToken, previewPath }

3. Check artifact exists:
   ```
   ls -l ./data/previews/smoke/c1.json
   jq . ./data/previews/smoke/c1.json
   ```

4. Confirm metric increment:
   ```
   curl https://staging.example.com/metrics | grep preview_requests_total
   ```

### 5. Merge Strategy & Rollout

1. Merge feature PR into staging (squash merge)
2. Let staging verify workflow run and pass
3. Soak on staging for 24 hours (watch metrics and errors)
4. Progressive rollout to production only after soak passes & runbook confirmed

## Files Summary

All required files are in the repository:

- Implementation files in src/ and client/src/
- Tests in tests/
- Scripts in scripts/
- Documentation in docs/
- CI workflow in .github/workflows/
- Execution plan in PHASE_F_ROLLOUT_EXECUTION_PLAN.md
- Runbook in docs/runbook-preview.md