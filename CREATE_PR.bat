@echo off
REM WebSocketGuard PR Creation Script
REM This script automates the creation of a PR for WebSocketGuard improvements

echo Creating PR branch and committing changes...
git checkout -b fix/ws-guard-test-teardown

echo Staging files...
git add client/src/utils/__tests__/WebSocketGuard.test.js client/src/utils/env.js client/src/App.jsx client/src/index.js client/.eslintrc.json PR_DESCRIPTION.md CHANGED_FILES.md COMMIT_MESSAGE.txt MERGE_CHECKLIST.md

echo Committing changes...
git commit -F COMMIT_MESSAGE.txt

echo Pushing branch...
git push --set-upstream origin fix/ws-guard-test-teardown

echo.
echo PR branch created and pushed successfully!
echo.
echo To create the PR manually:
echo 1. Go to the GitHub repository page
echo 2. Click "Compare & pull request"
echo 3. Use the following title:
echo    Standardize REACT_APP_SHOW_DEV_TEST and add robust WebSocketGuard tests + teardown
echo 4. Copy the body content from PR_DESCRIPTION.md
echo 5. Set base branch to main
echo 6. Click "Create pull request"
echo.
echo If you have GitHub CLI installed, run:
echo gh pr create --title "Standardize REACT_APP_SHOW_DEV_TEST and add robust WebSocketGuard tests + teardown" --body-file PR_DESCRIPTION.md --base main