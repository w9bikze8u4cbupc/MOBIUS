# Mobius Firewall Tools

This folder contains tools to diagnose and (safely) modify Windows Firewall rules required for Mobius bootstrap on Windows (WSL + Docker Desktop).

## Files
- `diagnose-network.ps1` — Read-only network & firewall diagnostics (non-admin).
- `add-firewall-rules.ps1` — Adds minimal Mobius firewall rules (requires Administrator).
- `remove-firewall-rules.ps1` — Removes Mobius-specific firewall rules (requires Administrator).

## Quick usage

### 1. Diagnose current state (no admin required):

```powershell
.\scripts\diagnose-network.ps1
```

### 2. Add rules (run PowerShell as Administrator):

```powershell
.\scripts\add-firewall-rules.ps1
```

For a dry-run:

```powershell
.\scripts\add-firewall-rules.ps1 -DryRun
```

### 3. If you need to remove rules later:

```powershell
.\scripts\remove-firewall-rules.ps1
```

## Why these rules exist
- Allow inbound access to the Mobius API on TCP port 5001 for local testing.
- Allow Docker Desktop program traffic so WSL/desktop interactions and container pulls are not blocked.
- Allow WSL outbound HTTP/HTTPS so WSL can fetch packages and images.

## Domains / endpoints to whitelist for IT (if behind corporate firewall / proxy)
- `github.com`, `raw.githubusercontent.com`, `api.github.com`
- `registry.npmjs.org`
- `registry-1.docker.io`, `auth.docker.io`, `registry-1.docker.io`
- `archive.ubuntu.com`, `security.ubuntu.com` (or your distro mirrors)

If in a corporate environment, ask IT to whitelist these domains for your machine or Docker Desktop.

## Proxy guidance
- **Docker Desktop**: Settings → Resources → Proxies or configure system proxy settings in Docker Desktop.
- **WSL**: export `HTTP_PROXY`/`HTTPS_PROXY` in `~/.profile` or systemd user environment as required.

## Security notes
- Rules added are intentionally narrow and reversible.
- We do **NOT** open Docker daemon ports (2375/2376).
- If you are unsure, use the DryRun flag and consult your security team.

## Troubleshooting
- After adding rules, restart Docker Desktop.
- If Docker pulls still fail, re-run `diagnose-network.ps1` and collect outputs for review.
- To temporarily test if firewall is the cause, an admin can briefly disable Windows Firewall, run the bootstrap, then re-enable it. This is only a diagnostic step — do not leave the firewall off.

## Contact / support
If you run into issues, collect:
- Output of `diagnose-network.ps1`
- `compose-logs.log` (docker compose logs)
- `smoke-tests.log`

and share them with the Mobius maintainer for triage.
