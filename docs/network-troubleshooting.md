# Network Troubleshooting Checklist

## 🚨 Quick Diagnostic Steps

If you're experiencing network connectivity issues with the Mobius Games Tutorial Generator, follow this checklist:

### 1. Run Automated Tests
```bash
# Basic connectivity test
./scripts/network-probe.sh

# Detailed diagnostics (attach output to issues)
./scripts/network-diagnostics.sh > network-report.txt
```

### 2. Manual Endpoint Tests

#### Test OpenAI API
```bash
# Basic connectivity
curl -I https://api.openai.com/v1/models

# With timeout and verbose output
curl -v --connect-timeout 10 https://api.openai.com/v1/models

# DNS lookup
dig api.openai.com
nslookup api.openai.com
```

#### Test ElevenLabs API
```bash
# Basic connectivity  
curl -I https://api.elevenlabs.io/v1/voices

# With timeout and verbose output
curl -v --connect-timeout 10 https://api.elevenlabs.io/v1/voices

# DNS lookup
dig api.elevenlabs.io
nslookup api.elevenlabs.io
```

#### Test LibreTranslate (Local)
```bash
# Check if service is running
curl -I http://localhost:5002/translate

# Check process
ps aux | grep libretranslate
netstat -tulpn | grep 5002
```

### 3. Network Path Analysis

#### Traceroute Tests
```bash
# To OpenAI (Linux/Mac)
traceroute api.openai.com

# To ElevenLabs (Linux/Mac)  
traceroute api.elevenlabs.io

# Windows equivalent
tracert api.openai.com
tracert api.elevenlabs.io
```

#### Port Connectivity Tests
```bash
# Test HTTPS ports (443)
telnet api.openai.com 443
telnet api.elevenlabs.io 443

# Alternative with nc (netcat)
nc -zv api.openai.com 443
nc -zv api.elevenlabs.io 443
```

### 4. Common Issues Checklist

- [ ] **DNS Resolution**: Can you resolve the API domains?
- [ ] **Firewall Rules**: Are the domains/IPs whitelisted?
- [ ] **Corporate Proxy**: Is your company proxy blocking API calls?
- [ ] **Network Policies**: Are HTTPS outbound connections allowed?
- [ ] **API Keys**: Are your API keys set correctly?
- [ ] **Service Status**: Are the external APIs experiencing outages?

### 5. Environment-Specific Checks

#### Corporate Networks
- [ ] Check with IT department about firewall rules
- [ ] Verify proxy configuration (`HTTP_PROXY`, `HTTPS_PROXY` env vars)
- [ ] Test from a different network (mobile hotspot) to isolate the issue

#### Cloud/CI Environments
- [ ] Check security group rules (AWS/GCP/Azure)
- [ ] Verify outbound internet access is enabled
- [ ] Check if the container/VM has internet connectivity
- [ ] Review cloud provider's firewall/NAT gateway settings

#### Local Development
- [ ] Check local firewall (Windows Defender, iptables, etc.)
- [ ] Verify no VPN is blocking connections
- [ ] Test with different DNS servers (8.8.8.8, 1.1.1.1)

### 6. What to Include in Bug Reports

When reporting network issues, please attach:

```bash
# Run this and attach the complete output
./scripts/network-diagnostics.sh > network-report-$(date +%Y%m%d-%H%M%S).txt
```

**Also include:**
- Your operating system and version
- Network environment (home, corporate, cloud provider)
- Specific error messages from the application logs
- Whether the issue is consistent or intermittent
- Any recent network/firewall changes

### 7. Emergency Workarounds

#### If OpenAI API is blocked:
- Use a different OpenAI endpoint if available
- Configure a proxy server
- Use API keys for a different region/endpoint

#### If ElevenLabs API is blocked:
- Use a different TTS service
- Generate audio locally if possible
- Use cached audio files for development

#### If all external APIs are blocked:
- Use mock/stub responses for development
- Set up a proxy server in an allowed network
- Request IT department to whitelist the required domains

### 8. Required Firewall Rules

**For IT departments to whitelist:**

| Service | Domain | Port | Protocol |
|---------|--------|------|----------|
| OpenAI API | api.openai.com | 443 | HTTPS |
| ElevenLabs API | api.elevenlabs.io | 443 | HTTPS |
| LibreTranslate | localhost | 5002 | HTTP |

**IP Ranges (if domain whitelisting isn't possible):**
```bash
# Get current IPs (these may change)
dig +short api.openai.com
dig +short api.elevenlabs.io
```

### 9. Service Status Checks

Before troubleshooting, check if the services are operational:
- OpenAI Status: https://status.openai.com/
- ElevenLabs Status: Check their website or social media
- Your internet connection: https://www.google.com/

### 10. Contact Information

If you've exhausted all troubleshooting steps:
1. Create a GitHub issue with your network diagnostic report
2. Include the specific error messages and environment details
3. Tag the issue with `network` and `troubleshooting` labels