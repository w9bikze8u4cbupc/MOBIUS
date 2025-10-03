@echo off
setlocal
set BRANCH=%1
if "%BRANCH%"=="" set BRANCH=feat/tutorial-visibility

git checkout -B %BRANCH%
git add .
git commit -m "chore(tutorial-visibility): add final PR artifacts and docs" 2>NUL || echo Commit skipped (no changes)
git push --set-upstream origin %BRANCH%
where gh >NUL 2>&1
if %ERRORLEVEL%==0 (
  gh pr create --title "Add REACT_APP_SHOW_TUTORIAL env helper, docs, tests, and CI" --body-file TUTORIAL_VISIBILITY_PR_BODY.md --base main --head %BRANCH% --label feature
) else (
  echo gh CLI not found. PR pushed to origin/%BRANCH%. Create PR manually.
)

endlocal