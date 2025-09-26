# Branch protection setup (GitHub CLI)

## Default usage (replace OWNER/REPO/BRANCH if different):
```bash
.github/scripts/branch-protection-setup.sh w9bikze8u4cbupc/MOBIUS main
```

## One-line GH API example (copy/paste, replace OWNER/REPO/BRANCH):
```bash
gh api -X PUT /repos/OWNER/REPO/branches/BRANCH/protection \
  -f required_status_checks='{"strict":true,"contexts":["build-and-qa","Golden Preview Checks / check","Golden Approve / approve"]}' \
  -f required_pull_request_reviews='{"required_approving_review_count":2}'
```

## Script version
If you prefer a script, create `.github/scripts/branch-protection-setup.sh` with:
```bash
#!/usr/bin/env bash
set -euo pipefail
if [ "$#" -ne 2 ]; then
  echo "Usage: $0 OWNER/REPO BRANCH"
  exit 1
fi
REPO="$1"
BRANCH="$2"
gh api -X PUT /repos/${REPO}/branches/${BRANCH}/protection \
  -f required_status_checks='{"strict":true,"contexts":["CI / build-and-qa","premerge-validation","premerge-artifacts-upload"]}' \
  -f required_pull_request_reviews='{"required_approving_review_count":2}'
echo "Branch protection set for ${REPO} ${BRANCH}"
```

## Notes
- Ensure GitHub CLI is authenticated (`gh auth login`) with required permissions.
- Confirm context names exactly match those in your GitHub Actions workflows.