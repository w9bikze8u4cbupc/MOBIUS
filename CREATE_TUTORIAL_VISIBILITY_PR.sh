#!/bin/bash

echo "Creating PR for tutorial visibility feature..."
echo "Make sure you have the GitHub CLI installed and authenticated."
echo "If you don't have it installed, you can download it from https://cli.github.com/"
echo
echo "Run this command to create the PR:"
echo
echo 'gh pr create --title "Add REACT_APP_SHOW_TUTORIAL env helper, docs, tests, and CI" --body-file TUTORIAL_VISIBILITY_PR_BODY.md --base main --head feat/tutorial-visibility --label "feature"'
echo
read -p "Press any key to continue..."