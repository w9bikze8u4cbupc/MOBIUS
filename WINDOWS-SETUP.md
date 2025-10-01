# Windows Setup Guide for Mobius

If you're running Mobius on Windows with WSL and Docker Desktop, you may encounter network connectivity issues due to Windows Firewall blocking required traffic.

## Quick Fix for Firewall Issues

We provide PowerShell scripts to diagnose and fix these issues:

### 1. Diagnose Network Issues

```powershell
# Run in PowerShell (Administrator recommended)
.\scripts\diagnose-network.ps1
```

This will test:
- Connectivity to GitHub, NPM, and Docker Hub
- Windows Firewall status
- Existing firewall rules
- Port 5001 availability (Mobius API)
- Docker Desktop installation

### 2. Add Required Firewall Rules

```powershell
# MUST run as Administrator
.\scripts\add-firewall-rules.ps1
```

This adds minimal rules to allow:
- Inbound connections to Mobius API (port 5001)
- Docker Desktop outbound/inbound traffic
- WSL outbound HTTP/HTTPS (ports 80, 443)

### 3. Remove Firewall Rules (if needed)

```powershell
# MUST run as Administrator
.\scripts\remove-firewall-rules.ps1
```

## Detailed Documentation

For comprehensive troubleshooting, proxy configuration, and security notes, see:

**[scripts/FIREWALL-README.md](scripts/FIREWALL-README.md)**

## Common Issues

### Problem: Bootstrap fails with connection errors

**Solution:** Run `add-firewall-rules.ps1` as Administrator, then restart Docker Desktop

### Problem: "Cannot reach registry.npmjs.org" or "Cannot reach registry-1.docker.io"

**Solution:** 
1. Run `diagnose-network.ps1` to check connectivity
2. If behind corporate proxy, configure Docker Desktop and WSL proxy settings (see [scripts/FIREWALL-README.md](scripts/FIREWALL-README.md))
3. Add firewall rules with `add-firewall-rules.ps1`

### Problem: Port 5001 already in use

**Solution:**
```powershell
# Check what's using port 5001
Get-Process -Id (Get-NetTCPConnection -LocalPort 5001).OwningProcess
```

Stop that process or configure Mobius to use a different port via the `PORT` environment variable.

## WSL-Specific Notes

- Always work in the WSL filesystem (`~/mobius`) to avoid permission issues
- If DNS fails in WSL, check `/etc/resolv.conf`
- WSL may require the firewall rules even if Windows firewall appears disabled

## Need More Help?

1. Run `diagnose-network.ps1` and save the output
2. Collect Docker logs: `docker compose logs --no-color > compose-logs.log`
3. Share both with the development team

---

**Note:** These scripts are safe and add minimal firewall rules. They can be rolled back at any time using `remove-firewall-rules.ps1`.
