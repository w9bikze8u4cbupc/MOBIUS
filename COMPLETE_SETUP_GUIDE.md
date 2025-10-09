# Complete Setup Guide for Phase F Rollout

## Current Status

We've identified that the GitHub token is not properly set in the environment, which is causing the 401 authentication error. This guide will help you set up the token correctly and create the necessary PRs and issues.

## Files Available

1. `GITHUB_TOKEN_SETUP.md` - Detailed instructions for creating and setting up a GitHub token
2. `setup_and_create.ps1` - PowerShell script to automate token setup and creation
3. Payload files for API calls:
   - `pr_feature.json`
   - `pr_ci.json`
   - `preview_issue.json`
   - `asset_issue.json`
   - `packaging_issue.json`
4. Content files for manual creation:
   - `FEATURE_PR_BODY.md`
   - `CI_WORKFLOW_PR_BODY.md`
   - `ISSUE_PREVIEW_WORKER.md`
   - `ISSUE_ASSET_UPLOADS.md`
   - `ISSUE_EXPORT_PACKAGING.md`

## Two Options for Completion

### Option 1: Automated Creation (Recommended)
1. Run the PowerShell setup script:
   ```powershell
   .\setup_and_create.ps1
   ```
2. Follow the prompts to enter your GitHub token
3. Choose option 1 to automatically create all PRs and issues

### Option 2: Manual Creation via Web UI
1. Follow the instructions in `GITHUB_TOKEN_SETUP.md` to create and set up your GitHub token
2. Visit the URLs provided in the script output to create:
   - Feature PR
   - CI Workflow PR
   - Three issues (Preview Worker, Asset Uploads, Packaging)

## After Creation

Once you've created the PRs and issues:

1. Share the PR URLs in the chat
2. I will validate the content and provide reviewer checklists
3. I will coordinate the staging verification process
4. I will help break down the Preview Worker issue into subtasks

## Troubleshooting

If you encounter any issues:

1. Ensure your GitHub token has the correct scopes (repo, workflow, public_repo)
2. Verify that the repository owner and name are correct (w9bikze8u4cbupc/MOBIUS)
3. Check that you have proper permissions to create PRs and issues in the repository
4. If using an organization repository, ensure SSO is authorized for the token

## Security Notes

- Never share your GitHub token with anyone
- The token should only be stored in environment variables, never in files
- If you suspect your token has been compromised, regenerate it immediately
- Use fine-grained tokens when possible for better security