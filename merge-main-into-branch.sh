#!/bin/bash

# Script to merge main into the current branch

set -e  # Exit on any error

echo "Fetching latest changes from origin..."
git fetch origin

echo "Merging origin/main into current branch..."
git merge origin/main

echo "Running tests to verify merge..."
npm ci
npm run test:preview-payloads
npm test

echo "If tests pass, you can now push the changes:"
echo "git add ."
echo "git commit -m \"chore(ci): merge main into branch\""
echo "git push origin \$(git branch --show-current)"