# Script to merge main into the current branch

Write-Host "Fetching latest changes from origin..." -ForegroundColor Green
git fetch origin

Write-Host "Merging origin/main into current branch..." -ForegroundColor Green
git merge origin/main

Write-Host "Running tests to verify merge..." -ForegroundColor Green
npm ci
npm run test:preview-payloads
npm test

Write-Host "If tests pass, you can now push the changes:" -ForegroundColor Cyan
Write-Host "git add ."
Write-Host "git commit -m `"chore(ci): merge main into branch`""
Write-Host "git push origin \$(git branch --show-current)"