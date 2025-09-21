#!/bin/bash

# Local git commands for the PR

# Stage everything
git add -A

# Commit with a concise message
git commit -m "chore(api): centralize fetchJson, migrate extract/search calls, add DevTestPage and tests"

# Push branch
git push -u origin feat/centralize-fetch

echo "Changes pushed to remote repository. Please create a PR using your Git hosting UI."