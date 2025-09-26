# Branch Protection Setup for MOBIUS

This document provides CLI commands and scripts to set up branch protection rules for the MOBIUS repository.

## Prerequisites

- [GitHub CLI](https://cli.github.com/) installed and authenticated
- Repository admin permissions
- PowerShell (Windows) or Bash (Linux/macOS)

## Quick Setup

### 1. Main Branch Protection (Recommended)

```bash
#!/bin/bash
# setup-branch-protection.sh

REPO="w9bikze8u4cbupc/MOBIUS"
BRANCH="main"

echo "Setting up branch protection for ${REPO}:${BRANCH}..."

gh api repos/${REPO}/branches/${BRANCH}/protection \
  --method PUT \
  --field required_status_checks='{"strict":true,"contexts":["ci/build","ci/test","ci/security-scan","ci/golden-tests"]}' \
  --field enforce_admins=true \
  --field required_pull_request_reviews='{"required_approving_review_count":1,"dismiss_stale_reviews":true,"require_code_owner_reviews":true,"require_last_push_approval":false}' \
  --field restrictions=null \
  --field allow_force_pushes=false \
  --field allow_deletions=false \
  --field block_creations=false

echo "✅ Branch protection enabled for ${BRANCH}"
```

### 2. PowerShell Version (Windows)

```powershell
# setup-branch-protection.ps1

$REPO = "w9bikze8u4cbupc/MOBIUS"
$BRANCH = "main"

Write-Host "Setting up branch protection for $REPO`:$BRANCH..." -ForegroundColor Green

$protection = @{
    required_status_checks = @{
        strict = $true
        contexts = @("ci/build", "ci/test", "ci/security-scan", "ci/golden-tests")
    }
    enforce_admins = $true
    required_pull_request_reviews = @{
        required_approving_review_count = 1
        dismiss_stale_reviews = $true
        require_code_owner_reviews = $true
        require_last_push_approval = $false
    }
    restrictions = $null
    allow_force_pushes = $false
    allow_deletions = $false
    block_creations = $false
}

$body = $protection | ConvertTo-Json -Depth 10

gh api repos/$REPO/branches/$BRANCH/protection `
  --method PUT `
  --input - `
  --header "Accept: application/vnd.github.v3+json" `
  <<< $body

Write-Host "✅ Branch protection enabled for $BRANCH" -ForegroundColor Green
```

## Detailed Configuration

### Required Status Checks

Set up the following status checks to be required before merging:

```bash
# Individual status check commands
gh api repos/w9bikze8u4cbupc/MOBIUS/branches/main/protection/required_status_checks \
  --method PATCH \
  --field strict=true \
  --field contexts='["ci/build","ci/test","ci/security-scan","ci/golden-tests","ci/lint","ci/integration-test"]'
```

### Pull Request Reviews

Configure PR review requirements:

```bash
# PR review protection
gh api repos/w9bikze8u4cbupc/MOBIUS/branches/main/protection/required_pull_request_reviews \
  --method PATCH \
  --field required_approving_review_count=1 \
  --field dismiss_stale_reviews=true \
  --field require_code_owner_reviews=true \
  --field require_last_push_approval=false
```

### Advanced Protection Rules

#### Restrict Push Access (Optional)

```bash
# Restrict pushes to specific teams or users
gh api repos/w9bikze8u4cbupc/MOBIUS/branches/main/protection/restrictions \
  --method PUT \
  --field users='["{{ADMIN_USERNAME}}"]' \
  --field teams='["{{CORE_TEAM}}"]' \
  --field apps='[]'
```

#### Enforce Admin Rules

```bash
# Apply rules to administrators
gh api repos/w9bikze8u4cbupc/MOBIUS/branches/main/protection/enforce_admins \
  --method PUT
```

## Development Branch Protection

For development branches that should have lighter protection:

```bash
#!/bin/bash
# setup-dev-branch-protection.sh

REPO="w9bikze8u4cbupc/MOBIUS"
BRANCH="{{DEV_BRANCH_NAME}}"  # e.g., "develop", "staging"

echo "Setting up development branch protection for ${REPO}:${BRANCH}..."

gh api repos/${REPO}/branches/${BRANCH}/protection \
  --method PUT \
  --field required_status_checks='{"strict":true,"contexts":["ci/build","ci/test"]}' \
  --field enforce_admins=false \
  --field required_pull_request_reviews='{"required_approving_review_count":1,"dismiss_stale_reviews":false,"require_code_owner_reviews":false}' \
  --field restrictions=null \
  --field allow_force_pushes=false \
  --field allow_deletions=false

echo "✅ Development branch protection enabled for ${BRANCH}"
```

## Custom Status Checks for MOBIUS

### Game Tutorial Pipeline Checks

Add specific checks for the game tutorial generation pipeline:

```bash
# Add pipeline-specific status checks
CONTEXTS='[
  "ci/build",
  "ci/test", 
  "ci/lint",
  "ci/security-scan",
  "ci/golden-tests/sushi-go",
  "ci/golden-tests/love-letter", 
  "ci/golden-tests/hanamikoji",
  "ci/video-generation-test",
  "ci/audio-generation-test",
  "ci/metadata-extraction-test"
]'

gh api repos/w9bikze8u4cbupc/MOBIUS/branches/main/protection/required_status_checks \
  --method PATCH \
  --field strict=true \
  --field contexts="${CONTEXTS}"
```

## Environment-Specific Setup

### Production Environment

```bash
#!/bin/bash
# production-branch-protection.sh

REPO="w9bikze8u4cbupc/MOBIUS"
BRANCH="main"

gh api repos/${REPO}/branches/${BRANCH}/protection \
  --method PUT \
  --field required_status_checks='{"strict":true,"contexts":["ci/build","ci/test","ci/security-scan","ci/golden-tests","ci/performance-test","ci/integration-test"]}' \
  --field enforce_admins=true \
  --field required_pull_request_reviews='{"required_approving_review_count":2,"dismiss_stale_reviews":true,"require_code_owner_reviews":true,"require_last_push_approval":true}' \
  --field restrictions='{"users":["{{DEPLOY_USER}}"],"teams":["{{DEPLOY_TEAM}}"]}' \
  --field allow_force_pushes=false \
  --field allow_deletions=false
```

### Staging Environment

```bash
#!/bin/bash  
# staging-branch-protection.sh

REPO="w9bikze8u4cbupc/MOBIUS"
BRANCH="staging"

gh api repos/${REPO}/branches/${BRANCH}/protection \
  --method PUT \
  --field required_status_checks='{"strict":true,"contexts":["ci/build","ci/test","ci/golden-tests"]}' \
  --field enforce_admins=false \
  --field required_pull_request_reviews='{"required_approving_review_count":1,"dismiss_stale_reviews":true,"require_code_owner_reviews":false}' \
  --field restrictions=null \
  --field allow_force_pushes=false \
  --field allow_deletions=false
```

## Verification Commands

Check current branch protection status:

```bash
# View current protection rules
gh api repos/w9bikze8u4cbupc/MOBIUS/branches/main/protection

# List all protected branches
gh api repos/w9bikze8u4cbupc/MOBIUS/branches --paginate | jq '.[] | select(.protected == true) | {name: .name, protected: .protected}'

# Check specific protection components
gh api repos/w9bikze8u4cbupc/MOBIUS/branches/main/protection/required_status_checks
gh api repos/w9bikze8u4cbupc/MOBIUS/branches/main/protection/required_pull_request_reviews
```

## Troubleshooting

### Common Issues

1. **Authentication Error**
   ```bash
   gh auth login --scopes repo,admin:org
   ```

2. **Insufficient Permissions**
   - Ensure you have admin access to the repository
   - Check organization permissions if applicable

3. **Status Check Not Found**
   - Verify the status check names match your CI/CD pipeline
   - Ensure the checks have run at least once on the branch

### Remove Branch Protection

```bash
# Remove all protection (use with caution)
gh api repos/w9bikze8u4cbupc/MOBIUS/branches/main/protection --method DELETE

# Remove specific protection components
gh api repos/w9bikze8u4cbupc/MOBIUS/branches/main/protection/required_status_checks --method DELETE
gh api repos/w9bikze8u4cbupc/MOBIUS/branches/main/protection/required_pull_request_reviews --method DELETE
```

## Best Practices

1. **Start with basic protection** and add more rules gradually
2. **Test status checks** before making them required
3. **Document any custom rules** specific to your workflow  
4. **Regularly review** protection settings as the team grows
5. **Use CODEOWNERS file** for automatic review assignments
6. **Consider different rules** for different branch types (main, develop, feature)

## Automation

To run this setup automatically in CI/CD:

```yaml
# .github/workflows/setup-branch-protection.yml
name: Setup Branch Protection
on:
  push:
    branches: [main]
    paths: ['.github/branch-protection-setup.md']

jobs:
  setup:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    - name: Setup Branch Protection
      env:
        GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      run: |
        chmod +x .github/setup-branch-protection.sh
        .github/setup-branch-protection.sh
```

---

*Last updated: {{CURRENT_DATE}}*  
*Repository: w9bikze8u4cbupc/MOBIUS*