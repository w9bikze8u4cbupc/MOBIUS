# Windows Firewall Configuration for Mobius

This directory contains PowerShell scripts to diagnose and fix Windows Firewall issues that may prevent Docker, WSL, and the Mobius API from working properly on Windows systems.

## Problem

When running Mobius in WSL with Docker Desktop on Windows, the Windows Firewall may block:
- Docker image pulls from registry-1.docker.io
- npm package downloads from registry.npmjs.org
- GitHub repository access
- Local connections to the Mobius API (port 5001)
- WSL network traffic

## Scripts

### 1. `diagnose-network.ps1` - Network Diagnostics

**Purpose:** Tests network connectivity and checks firewall configuration.

**What it checks:**
- TCP connectivity to GitHub, NPM Registry, and Docker Hub
- Windows Firewall profile status (Domain, Private, Public)
- Existing Mobius firewall rules
- Port 5001 usage (Mobius API)
- Docker Desktop installation

**Usage:**
```powershell
# Run in PowerShell (Administrator recommended but not required)
.\scripts\diagnose-network.ps1
```

**When to use:**
- Before applying firewall rules to understand the current state
- After applying rules to verify they were added correctly
- When troubleshooting connection issues

### 2. `add-firewall-rules.ps1` - Add Firewall Rules

**Purpose:** Adds minimal Windows Firewall rules needed for Mobius to work.

**What it adds:**
1. **Mobius API (TCP 5001)** - Allows inbound connections to the Mobius API server
2. **Docker Desktop** - Allows Docker Desktop program (outbound and inbound)
3. **WSL HTTP** - Allows WSL outbound HTTP connections (port 80)
4. **WSL HTTPS** - Allows WSL outbound HTTPS connections (port 443)

**Usage:**
```powershell
# MUST run in elevated PowerShell (Administrator)
.\scripts\add-firewall-rules.ps1
```

**Requirements:**
- Must run as Administrator
- Windows PowerShell 5.1 or PowerShell 7+

**When to use:**
- After running diagnostics and confirming firewall is blocking traffic
- Before running bootstrap scripts or docker compose
- When setting up Mobius on a new Windows machine

### 3. `remove-firewall-rules.ps1` - Remove Firewall Rules

**Purpose:** Removes the firewall rules added by `add-firewall-rules.ps1`.

**What it removes:**
- All 5 Mobius-specific firewall rules
- Asks for confirmation before removing

**Usage:**
```powershell
# MUST run in elevated PowerShell (Administrator)
.\scripts\remove-firewall-rules.ps1
```

**Requirements:**
- Must run as Administrator
- Prompts for confirmation before removing rules

**When to use:**
- When uninstalling Mobius
- When troubleshooting by testing with rules removed
- To clean up firewall rules

## Quick Start Guide

### Step 1: Diagnose the Issue

Run the diagnostic script to check your current configuration:

```powershell
# Open PowerShell (no admin needed for basic checks)
cd path\to\MOBIUS
.\scripts\diagnose-network.ps1
```

Review the output:
- ✓ Green checkmarks = Working correctly
- ✗ Red X = Failed (needs attention)
- ⚠ Yellow warning = Optional or informational

### Step 2: Add Firewall Rules (if needed)

If diagnostics show connectivity failures:

```powershell
# Open PowerShell as Administrator (Right-click → "Run as Administrator")
cd path\to\MOBIUS
.\scripts\add-firewall-rules.ps1
```

The script will:
- Check for existing rules
- Add or update 5 firewall rules
- Show a summary of what was added

### Step 3: Restart and Test

After adding rules:

1. **Restart Docker Desktop** if it's running
2. **Run your bootstrap or compose commands** in WSL:
   ```bash
   # In WSL
   ~/run_mobius_wsl.sh
   # or
   docker compose -f docker-compose.staging.yml up -d --build
   ```
3. **Test the API** by accessing `http://localhost:5001` in your browser

### Step 4: Verify (Optional)

Run diagnostics again to confirm rules were added:

```powershell
.\scripts\diagnose-network.ps1
```

## Corporate Proxy Setup

If you're behind a corporate proxy, firewall rules alone may not be enough. You also need to:

### Configure Docker Desktop Proxy

1. Open Docker Desktop
2. Go to **Settings** → **Resources** → **Proxies**
3. Enable **Manual proxy configuration**
4. Set:
   - HTTP Proxy: `http://proxy.company:3128`
   - HTTPS Proxy: `http://proxy.company:3128`
5. Click **Apply & Restart**

### Configure WSL Proxy

In WSL, add to `~/.bashrc` or `~/.profile`:

```bash
export HTTP_PROXY="http://proxy.company:3128"
export HTTPS_PROXY="http://proxy.company:3128"
export http_proxy="http://proxy.company:3128"
export https_proxy="http://proxy.company:3128"
```

Then reload:
```bash
source ~/.bashrc
```

### Domains to Whitelist

Ask your IT department to whitelist these domains:
- `github.com`, `api.github.com`, `raw.githubusercontent.com`
- `registry.npmjs.org`
- `registry-1.docker.io`, `auth.docker.io`
- `archive.ubuntu.com`, `security.ubuntu.com` (for apt)

## Temporary Firewall Disable Test

**⚠️ Use with caution - only for quick testing**

To test if Windows Firewall is the problem:

```powershell
# Disable firewall temporarily (Administrator PowerShell)
Set-NetFirewallProfile -Profile Domain,Public,Private -Enabled False

# Test your operation (e.g., in WSL: ~/run_mobius_wsl.sh)

# IMMEDIATELY re-enable firewall
Set-NetFirewallProfile -Profile Domain,Public,Private -Enabled True
```

If operations work with firewall disabled, the firewall is the cause. Use `add-firewall-rules.ps1` instead of leaving the firewall disabled.

## Troubleshooting

### "Cannot be loaded because running scripts is disabled"

If you see this error, you need to enable script execution:

```powershell
# In Administrator PowerShell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Rules added but still can't connect

1. **Restart Docker Desktop** completely
2. **Check WSL DNS** in WSL:
   ```bash
   cat /etc/resolv.conf
   nslookup github.com
   ```
3. **Check corporate proxy** settings (see section above)
4. **Verify rules are enabled**:
   ```powershell
   Get-NetFirewallRule -DisplayName "Mobius API (TCP 5001) - allow inbound" | Format-List
   ```

### Docker Desktop not found

If Docker Desktop is installed in a non-standard location, edit `add-firewall-rules.ps1` and update this line:

```powershell
$dockerPath = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
```

Change it to your Docker Desktop installation path.

### Port 5001 already in use

If another application is using port 5001:

```powershell
# Check what's using port 5001
Get-Process -Id (Get-NetTCPConnection -LocalPort 5001).OwningProcess
```

Either stop that application or configure Mobius to use a different port by setting the `PORT` environment variable.

## Security Notes

### What These Rules Do

- **Minimal scope**: Only opens necessary ports/programs
- **Profile coverage**: Works on Domain, Private, and Public networks
- **Direction specific**: Inbound rules only for Mobius API; outbound for WSL/Docker
- **No Docker daemon exposure**: Does NOT expose Docker daemon ports (2375/2376)

### Risks and Mitigations

1. **Port 5001 exposed**: The Mobius API will be accessible from your local network
   - **Mitigation**: Only accessible on localhost by default; CORS configured for localhost:3000
   - **Mitigation**: For production, use proper authentication (TODO in codebase)

2. **Broad WSL HTTP/HTTPS**: Allows all outbound HTTP/HTTPS from Windows
   - **Mitigation**: Outbound only; doesn't expose services
   - **Alternative**: Use WSL-specific rules if needed (requires more complex configuration)

3. **Docker Desktop allowed**: Allows Docker Desktop program all connections
   - **Mitigation**: Program-specific rule; only Docker Desktop executable
   - **Mitigation**: Docker Desktop has its own security controls

## Rollback

To remove all Mobius firewall rules:

```powershell
# Administrator PowerShell
.\scripts\remove-firewall-rules.ps1
```

This will:
- Show you what will be removed
- Ask for confirmation
- Remove all 5 rules
- Show a summary

## Additional Resources

- [Docker Desktop networking](https://docs.docker.com/desktop/networking/)
- [WSL networking](https://learn.microsoft.com/en-us/windows/wsl/networking)
- [Windows Firewall with Advanced Security](https://learn.microsoft.com/en-us/windows/security/operating-system-security/network-security/windows-firewall/)

## Support

If issues persist after applying these fixes:

1. Run `diagnose-network.ps1` and save the output
2. Collect logs:
   ```bash
   # In WSL
   docker compose -f docker-compose.staging.yml logs --no-color > compose-logs.log
   ```
3. Share both outputs with the development team

---

**Script Versions:**
- diagnose-network.ps1: 1.0
- add-firewall-rules.ps1: 1.0
- remove-firewall-rules.ps1: 1.0
