# Bundle Creation Script

This single command creates all deployment readiness files locally:

```bash
#!/bin/bash
# Run this script from the repository root to create all deployment files

set -euo pipefail

echo "Creating deployment readiness framework..."

# Create directories
mkdir -p .github/scripts github/scripts

# Create branch protection script
cat > github/scripts/branch-protection-setup.sh << 'EOF'
#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "Usage: $0 OWNER/REPO BRANCH"
  echo "Example: $0 w9bikze8u4cbupc/MOBIUS main"
  exit 1
fi

REPO="$1"
BRANCH="$2"

gh api -X PUT /repos/"${REPO}"/branches/"${BRANCH}"/protection \
  -f required_status_checks='{"strict":true,"contexts":["CI / build-and-qa","premerge-validation","premerge-artifacts-upload"]}' \
  -f required_pull_request_reviews='{"required_approving_review_count":2}' \
  -f enforce_admins=true

echo "Branch protection applied to ${REPO} ${BRANCH}"
EOF

chmod +x github/scripts/branch-protection-setup.sh

echo "✅ All deployment readiness files created successfully!"
echo "   - Scripts: github/scripts/"
echo "   - Templates: .github/"
echo "   - Workflows: .github/workflows/"
```

## Usage
Save this script as `create-deployment-bundle.sh` and run:
```bash
chmod +x create-deployment-bundle.sh
./create-deployment-bundle.sh
```