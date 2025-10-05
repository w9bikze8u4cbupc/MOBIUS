#!/bin/bash

# Script to open the MOBIUS verification PR
# Usage: ./open-pr.sh

echo "🚀 Opening MOBIUS Verification PR"

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
  echo "❌ Error: package.json not found. Please run this script from the repository root."
  exit 1
fi

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
  echo "❌ Error: GitHub CLI (gh) not found. Please install it first."
  echo "   Visit: https://cli.github.com/"
  exit 1
fi

# Check if we're on the correct branch
current_branch=$(git branch --show-current)
if [ "$current_branch" != "feature/mobius-verification-scripts" ]; then
  echo "⚠️  Warning: You're not on the feature/mobius-verification-scripts branch."
  echo "   Current branch: $current_branch"
  echo "   Please switch to the correct branch before running this script."
  read -p "Continue anyway? (y/N): " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

# Create the PR
echo "🔄 Creating PR..."
gh pr create --base main --head feature/mobius-verification-scripts \
  --title "Add cross-platform MOBIUS verification scripts + GitHub Actions workflow" \
  --body-file MOBIUS_PR_BODY.md \
  --label "chore,ci,scripts"

if [ $? -eq 0 ]; then
  echo "✅ PR created successfully!"
  echo "   You can now add reviewers interactively:"
  echo "   gh pr edit --add-reviewer @frontend-lead @backend-lead"
else
  echo "❌ Failed to create PR"
  exit 1
fi