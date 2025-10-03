# BRANCH PROTECTION — Secure Token Handling Guide

## Purpose

This guide documents safe practices for creating, using, and rotating GitHub tokens for repository administration tasks (for example, applying branch protection). Follow these rules to prevent accidental token exposure and reduce blast radius.

## Token creation (fine‑grained token recommended)

GitHub → Settings → Developer settings → Personal access tokens → Fine‑grained tokens → Generate new token

Name: "Branch Protection - Mobius Games"

Expiration: 30 days (short‑lived tokens are safer)

Repository access: Select repositories → choose only w9bikze8u4cbupc/mobius-games-tutorial-generator

Repository permissions (set to Read & write):

- Administration (Repository admin)
- Contents
- Pull requests

Generate and copy immediately. Do NOT paste tokens into chat, issues, commits, or logs.

If fine‑grained tokens are not available, a classic token with repo scope will work. Keep it tightly restricted and rotate often.

## Secure usage patterns

### Preferred methods (do not echo tokens):

#### Environment variable (transient):

Bash example:

```bash
read -s -p "GitHub token: " TOKEN; echo
export GITHUB_TOKEN="$TOKEN"
./scripts/apply-branch-protection.sh
unset GITHUB_TOKEN
```

PowerShell example:

```powershell
$token = Read-Host -AsSecureString "GitHub token"
$plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($token))
$env:GITHUB_TOKEN = $plain
.\scripts\apply-branch-protection.ps1
Remove-Item Env:GITHUB_TOKEN
```

#### gh CLI (local auth):

```bash
echo "YOUR_TOKEN" | gh auth login --with-token
# perform actions
gh auth logout
```

Avoid pasting into terminals that log history and avoid redirecting tokens into files without encryption.

### Never:

- Paste tokens into chat, public tickets, or code.
- Commit tokens into the repo (including .env, config files, or examples).
- Hard-code tokens in source code.

## CI / automation best practices

- Store tokens in GitHub Actions secrets or your CI secret store.
- Use least-privilege tokens for CI and prefer deploy keys or service accounts where possible.
- Do not hard-code tokens in workflows; reference them as `${{ secrets.MY_TOKEN }}`.

## Rotation & lifecycle policy

- Token expiry: prefer <= 90 days; 30 days for admin tasks is recommended.
- Rotate tokens monthly or after any personnel change.
- Revoke immediately if a token is suspected to be exposed.

## Incident response

1. Revoke the exposed token(s) immediately in GitHub settings.
2. Generate a replacement token with least privilege.
3. Search for accidental leaks (git history, PRs, CI logs) and remove them.
4. Rotate any other dependent credentials if necessary.

## Minimal safe script examples

### Secure interactive wrapper (bash):

```bash
#!/usr/bin/env bash
read -s -p "Enter GitHub token (won't echo): " TOKEN; echo
export GITHUB_TOKEN="$TOKEN"
"$@"
unset GITHUB_TOKEN
```

## Admin checklist before running an admin script

- [ ] Use a fine‑grained token scoped to the repository with Administration, Contents and Pull requests granted as Read & write.
- [ ] Validate the token:

```bash
curl -H "Authorization: Bearer $TOKEN" https://api.github.com/user
curl -H "Authorization: Bearer $TOKEN" https://api.github.com/repos/w9bikze8u4cbupc/mobius-games-tutorial-generator
```

- [ ] Ensure the token is not present in shell history.

## Token permission mapping for branch protection

To update branch protection the token must have repository Administration permissions (repo admin) at the repo level. Contents and Pull requests permissions are also required for related operations.

## Team policy recommendations

- Mandate fine‑grained tokens for admin tasks.
- Educate team members not to paste tokens into chat or tickets.
- Provide a runbook for generating and rotating tokens.
- Implement pre-commit checks to detect token-like patterns before commit.

The pre-commit hook in this repository will scan staged files for token-like patterns and fail the commit if potential secrets are detected. See the README for instructions on how to enable it.