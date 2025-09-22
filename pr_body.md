# Network Diagnostic Tools, Documentation, and CI Integration

## Summary

Adds comprehensive network diagnostic scripts, documentation, and CI integration to help diagnose and reproduce connectivity issues with external APIs (OpenAI, ElevenLabs). This addresses intermittent CI/staging failures caused by firewall, DNS, or egress restrictions by providing standardized diagnostics, safe reproduction tools, and CI artifacts to speed triage.

## What's Added

### Scripts (`scripts/` directory)
- **`network-probe.sh`** — Quick connectivity tests with colorized output and timestamped logs to `/tmp/`
- **`network-diagnostics.sh`** — Full diagnostics: DNS (system + public resolvers), TLS cert checks, traceroute, routing, proxy envs, and system network info
- **`reproduce-blocked-endpoints.sh`** — Safe `/etc/hosts`-based local reproduction tool (creates backups)

### Documentation (`docs/` directory)
- **`network-troubleshooting.md`** — Infra-focused troubleshooting guide, remediation steps, and commands to run
- **`developer-network-guide.md`** — Developer guide for using the tools, CI integration, and proxy handling

### CI Integration
- **`.github/workflows/ci.yml` (updated)** — Adds an early network probe job that uploads probe logs as artifacts (`continue-on-error`)
- **`package.json` (updated)** — Adds `start:server` script for CI workflow compatibility

### PR Template
- **`pr_body.md`** — Template and instructions for consistent PR descriptions

## Key Features

- **Quick and comprehensive diagnostics** (scripts for different levels of analysis)
- **SAFE reproduction** of blocked endpoints (backup/restore of `/etc/hosts` and clear markers)
- **CI integration** that captures probe logs as artifacts without failing the build
- **Environment variable support**: `EXTRA_NETWORK_HOSTS` to probe extra domains  
- **Cross-platform friendly**: Works on Linux, macOS, and WSL; gracefully skips missing utilities
- **Non-breaking additions**: purely diagnostic and documentation; no runtime behavior changes

## Usage Examples

### Quick Check
```bash
./scripts/network-probe.sh
```

### Detailed Diagnostics (generate report for infra)
```bash
./scripts/network-diagnostics.sh > /tmp/network-diagnostics-$(date +"%Y%m%dT%H%M%S").txt
```

### Reproduce Blocked Endpoints Locally (requires sudo)
```bash
sudo ./scripts/reproduce-blocked-endpoints.sh --block-all
# run your app to observe failures
sudo ./scripts/reproduce-blocked-endpoints.sh --restore
```

### Test Extra Hosts
```bash
EXTRA_NETWORK_HOSTS="images.example.com,another.host" ./scripts/network-probe.sh
```

## For Infrastructure Teams — Quick Diagnostic Commands

Run these on the affected CI/staging runner and attach outputs to the PR or ticket:

```bash
nslookup api.openai.com
dig +short api.openai.com  
traceroute -m 30 api.openai.com
curl -v --max-time 15 https://api.openai.com/v1/models
```

*(Repeat for `api.elevenlabs.io` and any other blocked hosts)*

**If DNS fails**, check `/etc/resolv.conf` and corporate DNS/proxy policies. **If TLS is re-signed**, ensure runners trust the corporate CA.

## Target Hosts (defaults)

- `api.openai.com` (OpenAI API)
- `api.elevenlabs.io` (ElevenLabs API)

Add others via `EXTRA_NETWORK_HOSTS`.

## CI Behavior

- The CI workflow runs `./scripts/network-probe.sh` early with `continue-on-error` so network problems are logged but do not break PR CI.
- Probe logs are uploaded as artifacts for review by developers and Infra.

## Files Changed / Added

- `scripts/network-probe.sh`
- `scripts/network-diagnostics.sh`
- `scripts/reproduce-blocked-endpoints.sh`
- `docs/network-troubleshooting.md`
- `docs/developer-network-guide.md`
- `.github/workflows/ci.yml` (updated)
- `pr_body.md`
- `package.json` (added `start:server` script for CI compatibility)

## Checklist (before merge)

- [ ] Mark scripts executable: `chmod +x scripts/*.sh`
- [ ] Add any organization-specific hosts to `EXTRA_NETWORK_HOSTS` in CI if needed
- [ ] Confirm `.github/workflows/ci.yml` uses correct `start:server` / ports for your repo
- [ ] Run `./scripts/network-probe.sh` locally to validate environment
- [ ] Attach `/tmp` network logs from failing CI runs if available
- [ ] Ensure Infra is aware of required egress to `api.openai.com` and `api.elevenlabs.io`

## Recommended Immediate Steps for Infra (if firewall block observed)

From the affected runner(s), capture and attach outputs of:
```bash
nslookup api.openai.com
dig +short api.openai.com
traceroute -m 30 api.openai.com
curl -v --max-time 15 https://api.openai.com/v1/models
```

**If DNS fails:** check `/etc/resolv.conf` and corporate resolver rules.
**If TCP/TLS fails:** verify egress rules allow outbound HTTPS (port 443) to the hosts, and whether a corporate proxy or TLS MITM is present.
**If TLS is re-signed:** add the corporate CA to the runner's trusted store (system/Node).
**Optionally:** whitelist the hosts or provide self-hosted runners with required egress.

## Warning (observed during validation)

⚠️ Firewall rules blocked connections to one or more addresses during earlier validation. Example blocked host observed:
- `api.openai.com`

Please attach logs (probe/dig/curl/traceroute) from the failing runner so Infra can triage.

## Suggested PR Attachments for Faster Triage

- `/tmp/network-probe-*.log` (from `network-probe.sh`)
- `/tmp/network-diagnostics-*.txt` (from `network-diagnostics.sh`)
- CI job log snippets showing connection errors (with timestamps)
- Output from commands listed in "For infrastructure teams" above

---

This PR provides the foundation for systematic network troubleshooting and should significantly reduce the time to diagnose and resolve network-related CI/staging failures.