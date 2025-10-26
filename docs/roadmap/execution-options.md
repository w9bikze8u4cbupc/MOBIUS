# Execution Options for Phase F Rollout

## Prerequisites

Before executing either option, you need:
1. A GitHub Personal Access Token (PAT) with `repo` scope
2. Repository owner and name (in this case: owner=`w9bikze8u4cbupc`, repo=`MOBIUS`)

## Option 1: Manual Web UI Approach

### Steps:
1. Open the Feature PR page:
   https://github.com/w9bikze8u4cbupc/MOBIUS/compare/staging...phase-f/preview-image-matcher
   Click "Create pull request" and use the following content:

   **Title:** `Phase F: Image Matcher UI + Preview backend stub`

   **Body:**
   ```
   Summary
   - Adds Image Matcher React component (drag/drop, asset library, match grid).
   - Adds Script Workbench container (ScriptEditor + ImageMatcher + PreviewPane).
   - Adds preview backend stub: POST /api/preview (validation, dry-run, artifact persisted at DATA_DIR/previews).
   - Adds metrics: preview_requests_total, preview_failures_total, preview_duration_ms.
   - Adds unit tests and verification scripts.

   Acceptance criteria
   - Unit tests pass (backend + client).
   - Dry-run preview writes artifact and increments metric.
   - Queue/back-pressure behavior enforced.
   - Docs updated (docs/api/preview.md and runbook).
   ```

   **Labels:** `feature`, `phase-f`, `needs-review`, `ready-for-staging`
   **Reviewers:** `developer`, `ops`, `team-lead`
   **Assignee:** `developer`

2. Open the CI Workflow PR page:
   https://github.com/w9bikze8u4cbupc/MOBIUS/compare/staging...ci/add-phase-f-verify-workflow
   Click "Create pull request" and use the following content:

   **Title:** `CI: Add staging verify workflow for Phase F`

   **Body:**
   ```
   Adds post-deploy verification jobs (Linux + Windows) to verify Phase F preview & matcher functionality. Runs scripts/verify-phase-f.sh and scripts/verify-phase-f.ps1 after the deploy_to_staging job completes. Uploads verification artifacts on failure for debugging.

   This workflow file: .github/workflows/staging-verify-phase-f.yml
   ```

   **Labels:** `ci`, `phase-f`
   **Reviewer:** `ops`
   **Assignee:** `developer`

3. Create three new issues using the content from the following files:
   - `ISSUE_PREVIEW_WORKER.md`
   - `ISSUE_ASSET_UPLOADS.md`
   - `ISSUE_EXPORT_PACKAGING.md`

## Option 2: Automated Approach (curl commands)

### Files Created:
1. `pr_feature.json` - Payload for Feature PR
2. `pr_ci.json` - Payload for CI Workflow PR
3. `preview_issue.json` - Payload for Preview Worker issue
4. `asset_issue.json` - Payload for Asset Uploads issue
5. `packaging_issue.json` - Payload for Export Packaging issue
6. `create_prs_and_issues.sh` - Bash script for automated creation
7. `create_prs_and_issues.ps1` - PowerShell script for automated creation

### Steps:
1. Set environment variables:
   ```bash
   export GITHUB_TOKEN="ghp_..."  # Your GitHub Personal Access Token
   export OWNER="w9bikze8u4cbupc"  # Repository owner
   export REPO="MOBIUS"  # Repository name
   ```

2. Run the script:
   ```bash
   chmod +x create_prs_and_issues.sh
   ./create_prs_and_issues.sh
   ```

   Or on Windows:
   ```powershell
   .\create_prs_and_issues.ps1
   ```

## After Execution

Once the PRs are created, paste the PR URLs here for validation and next steps coordination.