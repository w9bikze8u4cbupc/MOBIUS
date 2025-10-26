#!/bin/bash

# Script to verify branch status for documentation quality tests

echo "=== GitHub Branch Verification ==="
echo

# Check current branch
echo "Current branch:"
git branch --show-current
echo

# List all test-related branches
echo "Test branches:"
git branch -a | grep test
echo

# Show recent commits on smoke test branch
echo "Recent commits on smoke test branch:"
git log --oneline -5 test/docs-quality-smoke-test
echo

# Show recent commits on stress test branch
echo "Recent commits on stress test branch:"
git log --oneline -5 test/docs-quality-stress-test
echo

# Verify remote branches exist
echo "Remote branch status:"
git ls-remote --heads origin test/docs-quality-smoke-test
git ls-remote --heads origin test/docs-quality-stress-test
echo

echo "=== Verification Complete ==="
echo
echo "Next steps:"
echo "1. Visit https://github.com/w9bikze8u4cbupc/MOBIUS/actions"
echo "2. Check workflow runs for both branches"
echo "3. Document results in GITHUB_WORKFLOW_RUN_RESULTS.md"