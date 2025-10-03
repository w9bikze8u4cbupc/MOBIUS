#!/usr/bin/env bash
# Setup git hooks for the repository
set -euo pipefail

echo "Setting up git hooks..."

# Ensure .githooks directory exists
mkdir -p .githooks

# Make hooks executable
chmod +x .githooks/pre-commit 2>/dev/null || echo "Warning: Could not make pre-commit executable"
chmod +x .githooks/pre-commit.ps1 2>/dev/null || echo "Warning: Could not make pre-commit.ps1 executable"

# Configure git to use the .githooks directory
git config core.hooksPath .githooks

echo "Git hooks configured successfully!"
echo "Pre-commit token check is now enabled."
echo ""
echo "To bypass the hook (not recommended):"
echo "  git commit --no-verify"
echo "Or set SKIP_TOKEN_HOOK=1 for one commit:"
echo "  SKIP_TOKEN_HOOK=1 git commit -m \"message\""