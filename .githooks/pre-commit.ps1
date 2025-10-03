# .githooks/pre-commit.ps1
param()

# Allow devs to skip token check explicitly (not recommended)
if ($env:SKIP_TOKEN_HOOK) {
  exit 0
}

# Patterns to detect common secret/token formats (extendable)
$pattern = '(ghp_[A-Za-z0-9_]{36,}|github_pat_[A-Za-z0-9_]{36,}|GITHUB_TOKEN|AWS_SECRET_ACCESS_KEY|AIza[0-9A-Za-z-_]{35})'

# Get staged files
$staged = git diff --cached --name-only -z | ForEach-Object { $_ -split "`0" } | Where-Object { $_ -ne "" }

if (-not $staged) {
  exit 0
}

# Search staged diffs for token patterns
$matches = 0
foreach ($file in $staged) {
  # Only check text files
  if (git ls-files --error-unmatch -- $file 2>$null) {
    try {
      $content = git show ":$file" 2>$null
      if ($content -match $pattern) {
        Write-Host "Potential secret/token found in staged file: $file"
        # Show matching lines with line numbers
        $lines = $content -split "`n"
        for ($i = 0; $i -lt $lines.Count; $i++) {
          if ($lines[$i] -match $pattern) {
            Write-Host "$($i + 1): $($lines[$i])" -ForegroundColor Red
          }
        }
        $matches++
      }
    } catch {
      # Continue if file cannot be read
      continue
    }
  }
}

if ($matches -gt 0) {
  Write-Host ""
  Write-Host "Commit blocked: potential secret(s) detected in staged files." -ForegroundColor Red
  Write-Host "If this is a false positive, you can bypass the hook with --no-verify, or set SKIP_TOKEN_HOOK=1 for one commit." -ForegroundColor Yellow
  Write-Host "Recommended action: remove the secret from the file, rotate the secret if it was exposed, and then commit." -ForegroundColor Yellow
  exit 1
}

exit 0