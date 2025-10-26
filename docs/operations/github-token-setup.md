# GitHub Token Setup and PR Creation Guide

## Issue Diagnosis

The error message `{"message": "Bad credentials", "status": "401"}` indicates that the GitHub token is either:
1. Not set in the environment
2. Invalid or expired
3. Lacking proper permissions

## Step 1: Create a New GitHub Personal Access Token

1. Go to GitHub.com and log in to your account
2. Click on your profile picture in the top right corner
3. Select "Settings"
4. In the left sidebar, scroll down and click "Developer settings"
5. Click "Personal access tokens" then "Tokens (classic)"
6. Click "Generate new token" then "Generate new token (classic)"
7. Give your token a descriptive name (e.g., "Mobius Tutorial Generator")
8. Set an expiration date (or select "No expiration" if preferred)
9. Select the following scopes:
   - `repo` (Full control of private repositories)
   - `workflow` (Update GitHub Action workflows)
   - `public_repo` (Access public repositories)
10. Click "Generate token"
11. **IMPORTANT**: Copy the token immediately as it will not be shown again

## Step 2: Set the Token in Your Environment

### On Windows (Command Prompt):
```cmd
set GITHUB_TOKEN=github_pat_your_token_here
```

### On Windows (PowerShell):
```powershell
$env:GITHUB_TOKEN="github_pat_your_token_here"
```

### On Linux/macOS:
```bash
export GITHUB_TOKEN=github_pat_your_token_here
```

## Step 3: Verify the Token

Run this command to verify the token works:
```bash
curl -sS -H "Authorization: token $GITHUB_TOKEN" -H "Accept: application/vnd.github+json" https://api.github.com/user
```

You should see a JSON response with your user information, not a "Bad credentials" error.

## Step 4: Set Repository Variables

Set the repository owner and name:
```bash
export OWNER="w9bikze8u4cbupc"
export REPO="MOBIUS"
```

Or on Windows PowerShell:
```powershell
$env:OWNER="w9bikze8u4cbupc"
$env:REPO="MOBIUS"
```

## Step 5: Run the Creation Script

After setting up the token and variables, you can run:
```bash
./create_prs_and_issues.sh
```

Or on Windows:
```powershell
.\create_prs_and_issues.ps1
```

## Alternative: Manual Creation via Web UI

If you prefer not to use the API, you can create the PRs and issues manually:

1. **Feature PR**: 
   - URL: https://github.com/w9bikze8u4cbupc/MOBIUS/compare/staging...phase-f/preview-image-matcher
   - Title: "Phase F: Image Matcher UI + Preview backend stub"
   - Use content from `FEATURE_PR_BODY.md`

2. **CI Workflow PR**:
   - URL: https://github.com/w9bikze8u4cbupc/MOBIUS/compare/staging...ci/add-phase-f-verify-workflow
   - Title: "CI: Add staging verify workflow for Phase F"
   - Use content from `CI_WORKFLOW_PR_BODY.md`

3. **Issues**:
   - Create three new issues using content from:
     - `ISSUE_PREVIEW_WORKER.md`
     - `ISSUE_ASSET_UPLOADS.md`
     - `ISSUE_EXPORT_PACKAGING.md`

## Troubleshooting

If you still get authentication errors:

1. Double-check that the token was copied correctly (no extra spaces)
2. Verify the token has the required scopes
3. If using a fine-grained token, ensure it has access to the specific repository
4. If your organization requires SSO, you may need to authorize the token for the organization