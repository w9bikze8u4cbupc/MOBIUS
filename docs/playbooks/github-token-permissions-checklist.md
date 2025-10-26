# GitHub Token Permission Checklist for Phase F Automation

## Goal
Create a token that allows the `create_prs_and_issues` scripts to create PRs, issues, and push CI workflow changes without over-broad privileges.

## Important Safety Notes
- **DO NOT** paste the token anywhere public or into chat. Treat it like a password.
- Prefer a **fine-grained personal access token (PAT)** scoped to only the specific repository(ies) used.
- If your org enforces SAML SSO, you must authorize the token for the organization after creation.

## A. Create Token (Recommended: Fine-grained PAT)

1. Go to GitHub Settings → Developer settings → Personal access tokens → Fine-grained tokens
2. Click "Generate new token"
3. **Repository access**: Grant access only to the specific repository (e.g., `MOBIUS`)
4. **Minimal permission set (fine-grained)**:
   - **Code / Contents**: Read & write 
     - Allows creating files in branches and commits
     - Required for workflow file changes
   - **Pull requests**: Read & write
     - Required to open/update PRs and manage PR attributes
   - **Issues**: Read & write
     - Required to create/update issues
   - **Actions / Workflows**: Read & write
     - Only if automation will trigger or manage workflow runs
     - If only opening PRs with workflows, this may not be required
   - **Metadata**: Read (if available)
     - Useful to query repo info without wider access
5. **Token lifetime**: Set a reasonable expiry (30-90 days) and rotate regularly
6. Click "Generate token"
7. **Copy the token immediately** and store it securely

## B. If Your Org Uses SAML / SSO

1. After creating the token, go to your Organization's SSO page
2. "Authorize" the token for the organization (if required)
3. Failure to authorize will produce 401 for org repos

## C. Classic PAT (If You Cannot Use Fine-grained)

1. Go to GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Click "Generate new token"
3. **Required scopes**:
   - `repo` (Full control of private repositories)
   - `workflow` (Update GitHub Action workflows)
   - `public_repo` (Access public repositories)

## D. How to Set and Test Locally

### Bash (temporary in session):
```bash
export GITHUB_TOKEN="github_pat_..."
```

### PowerShell (session):
```powershell
$Env:GITHUB_TOKEN = "github_pat_..."
```

### Verify the CLI auth status:
```bash
gh auth status
```

### Basic sanity checks:
```bash
gh api user --jq '.login'
gh api repos/:owner/:repo --jq '.name'   # validate repo access
```

## E. Common Causes of 401 / "Bad credentials"

- Token not exported into the shell where script runs
- Using the wrong env var name in the script
- Token not authorized for the organization (SAML SSO)
- Token expired or revoked
- Token lacks repository permissions for the target repo
- Token was created with only read-only scopes but script requires write

## F. Quick Verification Flow

1. Ensure your branches are pushed:
   - `phase-f/preview-image-matcher`
   - `ci/add-phase-f-verify-workflow`
2. Export token into the same shell you will run the script from
3. Run verification commands:
   ```bash
   gh auth status
   gh api user --jq '.login'
   gh api repos/:OWNER/:REPO --jq '.private'   # replace :OWNER and :REPO
   ```

## G. If You Still Get 401

1. Re-check that token is authorized for the org (SAML SSO)
2. Verify the token permissions include Pull requests + Contents write + Issues
3. Generate a new token with minimal but sufficient permissions and authorize it
4. Try using the GitHub CLI auth flow instead: `gh auth login` (interactive and SSO-aware)
5. Check audit/organization settings

## H. Best Practices for Automation

- Use fine-grained tokens with least privileges and explicit repo selection
- Rotate tokens on a regular schedule and delete unused tokens
- Store token in secrets manager on CI runners; do not hardcode
- For CI (GitHub Actions) prefer actions/workflows using the built-in GITHUB_TOKEN where possible