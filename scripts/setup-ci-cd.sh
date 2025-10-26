#!/bin/bash

# setup-ci-cd.sh
# Bash script to set up CI/CD pipeline configuration

echo -e "\033[0;32mSetting up CI/CD pipeline configuration...\033[0m"

# 1. Configure GitHub Secrets
echo -e "\033[1;33m1. Configuring GitHub Secrets...\033[0m"

# Check if GitHub CLI is installed
if ! command -v gh &> /dev/null; then
    echo -e "\033[0;31mGitHub CLI not found. Please install it from https://cli.github.com/\033[0m"
    exit 1
fi

echo -e "\033[0;36mGitHub CLI found: $(gh --version | head -n 1)\033[0m"

# Get repository information
repo=$(gh repo view --json nameWithOwner -q '.nameWithOwner')
echo -e "\033[0;36mConfiguring repository: $repo\033[0m"

# Set up GHCR PAT secret
echo -e "\033[1;33mSetting up GHCR_PAT secret...\033[0m"
read -sp "Enter your GHCR Personal Access Token: " ghcr_pat
echo
gh secret set GHCR_PAT --body="$ghcr_pat" --repo="$repo"
echo -e "\033[0;32mGHCR_PAT secret configured successfully\033[0m"

# Set up KUBECONFIG_DATA secret
echo -e "\033[1;33mSetting up KUBECONFIG_DATA secret...\033[0m"
read -p "Enter path to your kubeconfig file (or press Enter to skip): " kubeconfig_path
if [ -n "$kubeconfig_path" ] && [ -f "$kubeconfig_path" ]; then
    kubeconfig_data=$(base64 -i "$kubeconfig_path")
    gh secret set KUBECONFIG_DATA --body="$kubeconfig_data" --repo="$repo"
    echo -e "\033[0;32mKUBECONFIG_DATA secret configured successfully\033[0m"
else
    echo -e "\033[1;33mSkipping KUBECONFIG_DATA setup\033[0m"
fi

# 2. Configure Branch Protection Rules
echo -e "\033[1;33m2. Configuring Branch Protection Rules...\033[0m"

# Protect main branch
echo -e "\033[1;33mProtecting main branch...\033[0m"
gh api -X PUT /repos/$repo/branches/main/protection \
    --field required_status_checks[strict]=true \
    --field required_status_checks[contexts][]="build-preview-worker" \
    --field required_status_checks[contexts][]="test-deployment-scripts" \
    --field enforce_admins=true \
    --field required_linear_history=true \
    --field allow_force_pushes=false \
    --field allow_deletions=false

echo -e "\033[0;32mMain branch protection configured successfully\033[0m"

# 3. Configure Environment Protection Rules
echo -e "\033[1;33m3. Configuring Environment Protection Rules...\033[0m"

# Create staging environment
echo -e "\033[1;33mCreating staging environment...\033[0m"
gh api -X PUT /repos/$repo/environments/staging \
    --field deployment_branches[]="main" \
    --field wait_timer=0

echo -e "\033[0;32mStaging environment configured successfully\033[0m"

# Create production environment
echo -e "\033[1;33mCreating production environment...\033[0m"
gh api -X PUT /repos/$repo/environments/production \
    --field deployment_branches[]="main" \
    --field wait_timer=5

echo -e "\033[0;32mProduction environment configured successfully\033[0m"

echo -e "\033[0;32mCI/CD pipeline setup completed successfully!\033[0m"
echo -e "\033[0;36mNext steps:\033[0m"
echo -e "\033[0;36m1. Verify secrets in GitHub repository settings\033[0m"
echo -e "\033[0;36m2. Test branch protection by creating a pull request\033[0m"
echo -e "\033[0;36m3. Validate environment protection by triggering a deployment\033[0m"