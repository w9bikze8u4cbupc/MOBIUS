# Pre-commit Hook Setup
Write-Host "Setting up pre-commit hooks..." -ForegroundColor Green

# Install husky
Write-Host "Installing husky..." -ForegroundColor Yellow
npm i -D husky

# Initialize husky
Write-Host "Initializing husky..." -ForegroundColor Yellow
npx husky install

# Add pre-commit hook
Write-Host "Adding pre-commit hook..." -ForegroundColor Yellow
npx husky add .husky/pre-commit "node --check src/api/index.js && echo Syntax OK"

# Make the hook executable (Windows doesn't need this, but for cross-platform)
Write-Host "Pre-commit hook setup complete!" -ForegroundColor Green
Write-Host "Commits will now be blocked if index.js has syntax errors." -ForegroundColor White