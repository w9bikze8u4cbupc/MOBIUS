# Setup coala pre-commit hook for Windows/PowerShell
Write-Host "Setting up coala pre-commit hook..." -ForegroundColor Green

# Check if we're in a git repository
if (-not (Test-Path ".git")) {
    Write-Host "Error: This script must be run from the root of a git repository" -ForegroundColor Red
    exit 1
}

# Create pre-commit hook
$HookPath = ".git\hooks\pre-commit"

# Check if pre-commit hook already exists
if (Test-Path $HookPath) {
    Write-Host "Warning: A pre-commit hook already exists. Backing it up..." -ForegroundColor Yellow
    Copy-Item $HookPath "$HookPath.backup"
}

# Create the pre-commit hook
$HookContent = @'
#!/bin/sh

# Run coala static analysis
echo "Running coala pre-commit checks..."

# Activate virtual environment if it exists
if [ -f ".venv/bin/activate" ]; then
    . .venv/bin/activate
elif [ -f ".venv/Scripts/activate" ]; then
    # Windows virtual environment
    . .venv/Scripts/activate
fi

# Run coala in non-interactive mode
coala --non-interactive

# Check the exit code
if [ $? -ne 0 ]; then
    echo "❌ coala found issues that need to be addressed before committing"
    echo "💡 Run 'coala -A' to automatically fix some issues"
    echo "💡 Run 'coala --non-interactive' to see all issues"
    exit 1
fi

echo "✅ coala checks passed"
exit 0
'@

# Write the hook content
$HookContent | Out-File -FilePath $HookPath -Encoding UTF8

Write-Host "✅ coala pre-commit hook installed successfully!" -ForegroundColor Green
Write-Host "💡 The hook will automatically run coala before each commit" -ForegroundColor Cyan
Write-Host "💡 To bypass the hook, use: git commit --no-verify" -ForegroundColor Cyan