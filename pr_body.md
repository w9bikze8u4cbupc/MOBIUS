# Network Diagnostics Tooling Implementation

## Overview
This PR adds comprehensive network diagnostics tooling to help identify and resolve firewall/networking issues that prevent access to external APIs (OpenAI and ElevenLabs) in CI and staging environments.

## 🚨 Firewall Warning for Infrastructure Teams

**CRITICAL**: This application requires outbound HTTPS access to external APIs. If you're experiencing network connectivity issues, the following domains need to be allowlisted in your firewall:

- ✅ **api.openai.com** (port 443) - OpenAI API for text generation
- ✅ **api.elevenlabs.io** (port 443) - ElevenLabs API for text-to-speech

### Immediate Steps for Infrastructure Teams

If the application is failing with network connectivity errors, please run these diagnostic commands on the affected CI/staging hosts:

```bash
# DNS resolution tests
nslookup api.openai.com
dig +short api.openai.com
nslookup api.elevenlabs.io
dig +short api.elevenlabs.io

# Connectivity tests
traceroute -m 30 api.openai.com
curl -v --max-time 15 https://api.openai.com/v1/models
curl -v --max-time 15 https://api.elevenlabs.io/

# Additional diagnostics
./scripts/reproduce-blocked-endpoints.sh
```

### Common Issues to Check
- [ ] Corporate firewall blocking outbound HTTPS to these domains
- [ ] DNS resolution failures (check /etc/resolv.conf)
- [ ] Transparent TLS MITM proxy interfering with SSL certificates
- [ ] Network policies in Kubernetes/container environments

### Short-term Mitigation
- Use self-hosted runners with known egress access
- Add explicit allowlist entries for the required domains
- Configure proxy bypass for these APIs if using corporate proxy

## What's Added

### 🔧 Network Diagnostic Scripts
- **`scripts/network-probe.sh`** - Quick connectivity tests for critical endpoints
- **`scripts/network-diagnostics.sh`** - Comprehensive network analysis with detailed reporting
- **`scripts/reproduce-blocked-endpoints.sh`** - Generates infrastructure team reports with specific commands to run

### 📚 Documentation
- **`docs/network-troubleshooting.md`** - Complete troubleshooting guide for network issues
- **`docs/developer-network-guide.md`** - Developer setup and configuration guide

### 🔄 CI Integration
- Added network probe step to CI workflow (`.github/workflows/ci.yml`)
- Early detection of network issues in CI pipeline
- Non-blocking execution (continues on error)

## How to Use

### For Developers
```bash
# Quick connectivity check
./scripts/network-probe.sh

# Comprehensive diagnostics
./scripts/network-diagnostics.sh
```

### For Infrastructure Teams
```bash
# Generate detailed report for network issues
./scripts/reproduce-blocked-endpoints.sh
```

### CI Integration
The network probe now runs automatically in CI and will report connectivity issues early in the pipeline, making it easier to identify when firewall changes break API access.

## Testing

All scripts have been tested for:
- ✅ Proper error handling and logging
- ✅ Cross-platform compatibility (Linux, macOS, Windows via WSL)
- ✅ Graceful degradation when tools are unavailable
- ✅ Clear output for both success and failure scenarios

## Impact

- **Zero breaking changes** - All additions are new files/features
- **Improves debugging** - Clear diagnostics for network issues
- **Reduces time to resolution** - Infrastructure teams get specific commands and requirements
- **Better CI visibility** - Network issues are detected early in the pipeline

## Files Changed

### New Files
- `scripts/network-probe.sh` - Basic connectivity tests
- `scripts/network-diagnostics.sh` - Comprehensive network analysis  
- `scripts/reproduce-blocked-endpoints.sh` - Infrastructure diagnostic tool
- `docs/network-troubleshooting.md` - Troubleshooting guide
- `docs/developer-network-guide.md` - Developer setup guide

### Modified Files
- `.github/workflows/ci.yml` - Added network probe step

## Future Enhancements

- [ ] Add monitoring/alerting integration
- [ ] Support for additional external APIs
- [ ] Network performance benchmarking
- [ ] Automated firewall rule generation

---

## For Infrastructure Teams - Quick Reference

**Required Firewall Rules:**
```
ALLOW outbound HTTPS (port 443) to:
- api.openai.com
- api.elevenlabs.io
```

**Diagnostic Commands:**
```bash
# Run on affected systems
nslookup api.openai.com
curl -v --max-time 15 https://api.openai.com/v1/models
traceroute api.openai.com
./scripts/reproduce-blocked-endpoints.sh
```

**Contact:** Share the output of diagnostic scripts with the development team for further assistance.