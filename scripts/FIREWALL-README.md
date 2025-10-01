# Windows Firewall Troubleshooting & Remediation Tools

This directory contains PowerShell scripts to diagnose and resolve Windows Firewall connectivity issues that can block Mobius development when using WSL + Docker Desktop.

## Quick Start

### 1. Diagnose (No Admin Required)

Run diagnostics to check connectivity and firewall status:

```powershell
.\scripts\diagnose-network.ps1
```

This script performs:
- TCP connectivity tests to GitHub, NPM, and Docker registries
- Windows Firewall profile status check
- Detection of existing Mobius firewall rules
- Port 5001 usage check
- Docker Desktop presence and daemon connectivity test

### 2. Review Planned Changes (Admin Required)

Before making changes, run in DryRun mode to see what rules would be created:

```powershell
# Run PowerShell as Administrator
.\scripts\add-firewall-rules.ps1 -DryRun
```

### 3. Apply Firewall Rules (Admin Required)

If the DryRun output looks safe, apply the rules:

```powershell
# Run PowerShell as Administrator
.\scripts\add-firewall-rules.ps1
```

**Important:** After applying rules, restart Docker Desktop and re-run your Mobius bootstrap.

### 4. Rollback (Admin Required)

To remove all Mobius firewall rules:

```powershell
# Run PowerShell as Administrator
.\scripts\remove-firewall-rules.ps1
```

Or skip confirmation prompt:

```powershell
.\scripts\remove-firewall-rules.ps1 -Force
```

---

## Scripts Overview

### `diagnose-network.ps1`

**Purpose:** Read-only diagnostics for connectivity and firewall issues

**Requirements:** None (no admin rights needed)

**What it checks:**
- TCP connectivity to:
  - `github.com:443`
  - `registry.npmjs.org:443`
  - `registry-1.docker.io:443`
- Windows Firewall status (Domain, Private, Public profiles)
- Existing Mobius firewall rules
- Port 5001 availability (used by Mobius API)
- Docker Desktop process and daemon accessibility

**Output:** Colored console report with recommendations

**Example usage:**
```powershell
# Basic diagnostics
.\scripts\diagnose-network.ps1

# Verbose output with error details
.\scripts\diagnose-network.ps1 -Verbose
```

---

### `add-firewall-rules.ps1`

**Purpose:** Create minimal, named firewall rules for Mobius development

**Requirements:** Must run as Administrator

**Rules created:**
1. **Mobius API Inbound (TCP 5001)**
   - Allows inbound connections to Mobius API on port 5001
   - Direction: Inbound
   - Protocol: TCP, Port 5001

2. **Docker Desktop Program Rules** (if Docker Desktop is found)
   - Allows inbound and outbound connections for Docker Desktop
   - Direction: Both Inbound and Outbound
   - Program: Docker Desktop executable path

3. **WSL Outbound HTTP (Port 80)**
   - Allows WSL outbound HTTP for package downloads
   - Direction: Outbound
   - Protocol: TCP, Port 80

4. **WSL Outbound HTTPS (Port 443)**
   - Allows WSL outbound HTTPS for secure package downloads
   - Direction: Outbound
   - Protocol: TCP, Port 443

**Features:**
- **Idempotent:** Running multiple times is safe; skips existing rules
- **DryRun mode:** Preview changes before applying
- **Named rules:** All rules prefixed with "Mobius" for easy identification
- **All profiles:** Rules apply to Domain, Private, and Public profiles

**Example usage:**
```powershell
# Dry run (preview only, no changes)
.\scripts\add-firewall-rules.ps1 -DryRun

# Apply rules
.\scripts\add-firewall-rules.ps1
```

**Docker Desktop detection:**
The script automatically searches for Docker Desktop in standard installation paths:
- `C:\Program Files\Docker\Docker\Docker Desktop.exe`
- `C:\Program Files (x86)\Docker\Docker\Docker Desktop.exe`
- `%LOCALAPPDATA%\Docker\Docker Desktop.exe`

If Docker Desktop is in a non-standard location, the Docker program rules will be skipped (but other rules will still be created).

---

### `remove-firewall-rules.ps1`

**Purpose:** Remove all Mobius-specific firewall rules

**Requirements:** Must run as Administrator

**What it does:**
- Scans for all firewall rules with names starting with "Mobius"
- Displays detailed information about each rule
- Prompts for confirmation before removal (unless `-Force` is used)
- Removes confirmed rules and reports results

**Features:**
- **Safe removal:** Only removes rules with "Mobius" prefix
- **Confirmation prompt:** Requires user confirmation (skipped with `-Force`)
- **Detailed listing:** Shows rule names, status, direction, ports, and programs

**Example usage:**
```powershell
# Remove with confirmation prompt
.\scripts\remove-firewall-rules.ps1

# Remove without prompting (use with caution)
.\scripts\remove-firewall-rules.ps1 -Force
```

---

## Common Scenarios & Troubleshooting

### Scenario 1: Still cannot pull images or packages after adding rules

**Possible causes:**
- Corporate proxy not configured in Docker Desktop
- Corporate firewall blocking external domains
- VPN interfering with connectivity

**Solutions:**
1. **Check proxy settings:**
   - Open Docker Desktop → Settings → Resources → Proxies
   - Configure HTTP/HTTPS proxy if behind corporate proxy

2. **Run diagnostics again:**
   ```powershell
   .\scripts\diagnose-network.ps1
   ```

3. **Request IT whitelist:**
   Ask your IT department to whitelist these domains:
   - `github.com`, `raw.githubusercontent.com`, `api.github.com`
   - `registry.npmjs.org`
   - `registry-1.docker.io`, `auth.docker.io`, `production.cloudflare.docker.com`
   - `archive.ubuntu.com`, `security.ubuntu.com` (or your distro mirrors)

### Scenario 2: Docker daemon unreachable from WSL

**Possible causes:**
- Docker Desktop WSL integration not enabled
- Docker service not running
- Firewall blocking WSL → Docker communication

**Solutions:**
1. **Enable WSL integration:**
   - Open Docker Desktop → Settings → Resources → WSL Integration
   - Enable integration for your WSL distro

2. **Restart Docker Desktop:**
   - Right-click Docker Desktop system tray icon → Quit Docker Desktop
   - Start Docker Desktop again

3. **Verify from WSL:**
   ```bash
   # In WSL terminal
   docker version
   docker ps
   ```

### Scenario 3: Scripts fail to run

**Possible causes:**
- PowerShell execution policy restrictions
- Not running as Administrator (for add/remove scripts)

**Solutions:**
1. **Check execution policy:**
   ```powershell
   Get-ExecutionPolicy
   ```

2. **Temporarily allow script execution (for current session):**
   ```powershell
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process -Force
   ```

3. **Run as Administrator:**
   - Right-click PowerShell → Run as Administrator
   - Navigate to repo directory
   - Run the script

### Scenario 4: Port 5001 already in use

**Possible causes:**
- Another application using port 5001
- Previous Mobius instance still running

**Solutions:**
1. **Identify the process:**
   ```powershell
   Get-NetTCPConnection -LocalPort 5001 | Select-Object OwningProcess
   Get-Process -Id <PID>
   ```

2. **Stop the conflicting process:**
   ```powershell
   Stop-Process -Id <PID>
   ```
   Or close the application manually.

### Scenario 5: Behind corporate firewall with proxy

**Setup recommendations:**
1. Configure Docker Desktop proxy settings
2. Set environment variables in WSL:
   ```bash
   export HTTP_PROXY=http://proxy.company.com:8080
   export HTTPS_PROXY=http://proxy.company.com:8080
   export NO_PROXY=localhost,127.0.0.1
   ```

3. Configure npm proxy (if using npm in WSL):
   ```bash
   npm config set proxy http://proxy.company.com:8080
   npm config set https-proxy http://proxy.company.com:8080
   ```

4. Request IT to whitelist domains (see list above)

---

## Security & Auditing Notes

### Security considerations:

1. **Named rules for transparency:**
   - All rules are prefixed with "Mobius" for easy identification
   - You can audit rules at any time:
     ```powershell
     Get-NetFirewallRule -DisplayName "Mobius*"
     ```

2. **No Docker daemon ports exposed:**
   - Docker daemon management ports (2375/2376) are NOT opened
   - Only application-level ports (5001) and outbound connections are allowed

3. **DryRun mode for review:**
   - Always use `-DryRun` first to review planned changes
   - No changes are made in DryRun mode

4. **All profiles by default:**
   - Rules apply to Domain, Private, and Public profiles
   - This ensures connectivity across different network types
   - If you need narrower scope, manually edit rules after creation

5. **Program-based rules:**
   - Docker Desktop rules are program-based (tied to executable path)
   - More secure than port-based rules for applications

### Auditing Mobius firewall rules:

```powershell
# List all Mobius rules
Get-NetFirewallRule -DisplayName "Mobius*" | Format-Table DisplayName, Enabled, Direction, Action

# Get detailed information about a specific rule
Get-NetFirewallRule -DisplayName "Mobius API Inbound (TCP 5001)" | Format-List *

# View port filters for a rule
Get-NetFirewallRule -DisplayName "Mobius*" | Get-NetFirewallPortFilter

# View program filters for a rule
Get-NetFirewallRule -DisplayName "Mobius*" | Get-NetFirewallApplicationFilter
```

---

## Rollback & Cleanup

To completely remove all Mobius firewall rules and return to pre-script state:

```powershell
# Remove all Mobius rules
.\scripts\remove-firewall-rules.ps1

# Restart Docker Desktop
# Right-click Docker Desktop system tray icon → Quit Docker Desktop
# Start Docker Desktop again

# Verify rules are gone
Get-NetFirewallRule -DisplayName "Mobius*"
```

---

## Enterprise Whitelist Reference

If your organization requires a whitelist for external connectivity, provide this list to your IT department:

### Required domains:

**GitHub:**
- `github.com` (HTTPS/443)
- `raw.githubusercontent.com` (HTTPS/443)
- `api.github.com` (HTTPS/443)

**NPM Registry:**
- `registry.npmjs.org` (HTTPS/443)

**Docker Registry:**
- `registry-1.docker.io` (HTTPS/443)
- `auth.docker.io` (HTTPS/443)
- `production.cloudflare.docker.com` (HTTPS/443)
- `registry.hub.docker.com` (HTTPS/443)

**Linux package repositories (for WSL):**
- `archive.ubuntu.com` (HTTP/80, HTTPS/443)
- `security.ubuntu.com` (HTTP/80, HTTPS/443)
- Or your specific Linux distro mirrors

### Optional but recommended:

- `nodejs.org` - Node.js downloads
- `dl.yarnpkg.com` - Yarn package manager
- `packages.microsoft.com` - Microsoft packages

---

## Technical Details

### Rule naming convention:
- Format: `Mobius - <Description> (<Details>)`
- Examples:
  - `Mobius API Inbound (TCP 5001)`
  - `Mobius - Docker Desktop (Inbound)`
  - `Mobius - WSL HTTPS Outbound (Port 443)`

### Rule properties:
- **Profile:** Domain, Private, Public (all three)
- **Enabled:** True
- **Action:** Allow
- **Protocol:** TCP
- **Direction:** Inbound or Outbound (as specified)

### Idempotency:
The `add-firewall-rules.ps1` script is fully idempotent:
- Checks for existing rules before creating
- Skips rules that already exist
- Safe to run multiple times

---

## Additional Resources

### Related documentation:
- Docker Desktop WSL integration: https://docs.docker.com/desktop/wsl/
- Windows Firewall with Advanced Security: https://docs.microsoft.com/en-us/windows/security/threat-protection/windows-firewall/

### Support:
If you encounter issues not covered in this document:
1. Run `diagnose-network.ps1` and capture output
2. Check `smoke-tests.log` (if bootstrap fails)
3. Check `compose-logs.log` (docker compose logs)
4. Review `verification-reports/*.json`

---

## License

These scripts are part of the Mobius project and are provided as-is for development purposes.
