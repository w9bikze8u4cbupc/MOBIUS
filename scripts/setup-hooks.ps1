# Setup git hooks for the repository
Write-Host "Setting up git hooks..."

# Ensure .githooks directory exists
if (-not (Test-Path -Path ".githooks")) {
    New-Item -ItemType Directory -Path ".githooks" -Force | Out-Null
}

# Make hooks executable (if on Unix-like system)
try {
    if ($IsLinux -or $IsMacOS) {
        chmod +x .githooks/pre-commit 2>$null
        chmod +x .githooks/pre-commit.ps1 2>$null
    }
} catch {
    Write-Warning "Could not make hooks executable"
}

# Configure git to use the .githooks directory
git config core.hooksPath .githooks

Write-Host "Git hooks configured successfully!" -ForegroundColor Green
Write-Host "Pre-commit token check is now enabled."
Write-Host ""
Write-Host "To bypass the hook (not recommended):"
Write-Host "  git commit --no-verify"
Write-Host "Or set SKIP_TOKEN_HOOK=1 for one commit:"
Write-Host "  `$env:SKIP_TOKEN_HOOK=1; git commit -m `"message`""