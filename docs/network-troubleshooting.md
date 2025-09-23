# Network Troubleshooting Guide

This guide helps diagnose and resolve network connectivity issues with external APIs used by the Mobius Games Tutorial Generator.

## External API Dependencies

The application relies on the following external services:

- **OpenAI API** (`api.openai.com:443`) - AI-powered component extraction and script generation
- **ElevenLabs API** (`api.elevenlabs.io:443`) - Text-to-speech generation
- **BoardGameGeek API** (`boardgamegeek.com:443`, `media.boardgamegeek.com:443`) - Game metadata and search
- **Extract.pics API** (`extract.pics:443`) - Image extraction from PDFs

## Running Network Diagnostics

### Quick Commands

```bash
# Run comprehensive network probe
npm run network:probe

# Run with mock mode for development
MOCK_OPENAI=true MOCK_ELEVENLABS=true MOCK_BGG=true MOCK_EXTRACT_PICS=true npm run network:test
```

### Manual Testing Commands

#### DNS Resolution
```bash
# Linux/macOS
dig +short api.openai.com
dig +short api.elevenlabs.io
dig +short boardgamegeek.com
dig +short extract.pics

# Windows
nslookup api.openai.com
nslookup api.elevenlabs.io
nslookup boardgamegeek.com
nslookup extract.pics
```

#### TCP Connectivity
```bash
# Linux/macOS
nc -vz api.openai.com 443
nc -vz api.elevenlabs.io 443
nc -vz boardgamegeek.com 443
nc -vz extract.pics 443

# Windows (using PowerShell)
Test-NetConnection api.openai.com -Port 443
Test-NetConnection api.elevenlabs.io -Port 443
Test-NetConnection boardgamegeek.com -Port 443
Test-NetConnection extract.pics -Port 443
```

#### HTTP/HTTPS Testing
```bash
# Test HTTP connectivity
curl -v --max-time 10 https://api.openai.com/v1/models
curl -v --max-time 10 https://api.elevenlabs.io/v1/user
curl -v --max-time 10 https://boardgamegeek.com/xmlapi2/search?query=test
curl -v --max-time 10 https://extract.pics/

# Windows (using PowerShell)
Invoke-WebRequest -Uri https://api.openai.com/v1/models -TimeoutSec 10
```

#### TLS Handshake Testing
```bash
# Test TLS handshake
openssl s_client -connect api.openai.com:443 -servername api.openai.com
openssl s_client -connect api.elevenlabs.io:443 -servername api.elevenlabs.io
openssl s_client -connect boardgamegeek.com:443 -servername boardgamegeek.com
openssl s_client -connect extract.pics:443 -servername extract.pics
```

#### Network Path Tracing
```bash
# Linux/macOS
traceroute -n api.openai.com
traceroute -n api.elevenlabs.io
traceroute -n boardgamegeek.com
traceroute -n extract.pics

# Windows
tracert api.openai.com
tracert api.elevenlabs.io
tracert boardgamegeek.com
tracert extract.pics
```

## Common Failure Modes & Solutions

### 1. DNS Resolution Failures

**Symptoms:**
- `NXDOMAIN` errors
- `dig` returns no results
- Timeouts during DNS lookup

**Diagnosis:**
```bash
# Check current DNS servers
cat /etc/resolv.conf  # Linux/macOS
ipconfig /all         # Windows

# Test with different DNS servers
dig @8.8.8.8 api.openai.com
dig @1.1.1.1 api.openai.com
```

**Solutions:**
- Configure public DNS servers (8.8.8.8, 1.1.1.1, 9.9.9.9)
- Check corporate DNS configuration
- Verify split-horizon DNS isn't blocking external domains
- Contact network administrator for DNS allowlist updates

### 2. TCP Connection Failures

**Symptoms:**
- `Connection refused` errors
- `Connection timed out` messages
- No SYN-ACK response

**Diagnosis:**
```bash
# Check local firewall
sudo iptables -L -n      # Linux
sudo ufw status verbose  # Ubuntu
netsh advfirewall show allprofiles  # Windows

# Test from different network
curl --connect-timeout 5 https://api.openai.com/v1/models
```

**Solutions:**
- **Firewall blocking:** Allow outbound connections on port 443 to required hosts
- **NAT/Proxy issues:** Configure proxy settings or NAT rules
- **Security groups:** Update cloud security group rules
- **Corporate firewall:** Request firewall exceptions for required endpoints

### 3. HTTP/HTTPS Failures

**Symptoms:**
- `SSL certificate verify failed`
- `Timeout` errors (exit code 28 with curl)
- HTTP status errors (4xx, 5xx)

**Diagnosis:**
```bash
# Test without certificate verification
curl -k -v https://api.openai.com/v1/models

# Check certificate details
openssl s_client -connect api.openai.com:443 -servername api.openai.com | openssl x509 -text
```

**Solutions:**
- **Certificate issues:** Update CA bundle or system certificates
- **Proxy interference:** Configure proxy bypass for API endpoints
- **Rate limiting:** Check API rate limits and implement backoff
- **Authentication:** Verify API keys and authentication headers

### 4. TLS Handshake Failures

**Symptoms:**
- `SSL handshake failed`
- `Protocol version` errors
- `Certificate verification failed`

**Diagnosis:**
```bash
# Test different TLS versions
openssl s_client -connect api.openai.com:443 -tls1_2
openssl s_client -connect api.openai.com:443 -tls1_3

# Check cipher suites
nmap --script ssl-enum-ciphers -p 443 api.openai.com
```

**Solutions:**
- **TLS interception:** Coordinate with security team to allow endpoints
- **Outdated TLS:** Update system TLS libraries
- **Certificate pinning:** Configure certificate exceptions
- **Corporate TLS inspection:** Update CA trust store with corporate certificates

## Platform-Specific Troubleshooting

### Linux/Ubuntu
```bash
# Update package repositories
sudo apt-get update

# Install required tools
sudo apt-get install -y curl wget netcat-traditional traceroute dnsutils openssl jq

# Check network interfaces
ip addr show
ip route show

# Check systemd-resolved (Ubuntu 18.04+)
systemctl status systemd-resolved
resolvectl status
```

### macOS
```bash
# Install tools via Homebrew
brew install jq netcat traceroute

# Check network configuration
networksetup -listallnetworkservices
networksetup -getdnsservers "Wi-Fi"

# Flush DNS cache
sudo dscacheutil -flushcache
sudo killall -HUP mDNSResponder
```

### Windows
```powershell
# Install Chocolatey packages
choco install jq curl wget

# Network diagnostics
ipconfig /all
netsh winsock show catalog
netsh int ip show config

# DNS cache management
ipconfig /flushdns

# Windows Firewall
netsh advfirewall firewall show rule name=all
```

## Corporate Network Considerations

### Common Enterprise Restrictions
- **Egress filtering:** Only specific ports/protocols allowed outbound
- **Proxy requirements:** HTTP/HTTPS traffic must go through corporate proxy
- **DNS filtering:** External domains blocked or redirected
- **TLS inspection:** Corporate certificates injected into TLS connections
- **IP allowlisting:** Only pre-approved IP ranges accessible

### Solutions for Enterprise Environments
1. **Request firewall exceptions:**
   ```
   Destination: api.openai.com, api.elevenlabs.io, boardgamegeek.com, extract.pics
   Protocol: HTTPS (TCP/443)
   Purpose: External API integration for game tutorial generation
   ```

2. **Configure proxy settings:**
   ```bash
   export HTTP_PROXY=http://proxy.company.com:8080
   export HTTPS_PROXY=http://proxy.company.com:8080
   export NO_PROXY=localhost,127.0.0.1,.company.com
   ```

3. **Use mock mode for development:**
   ```bash
   MOCK_OPENAI=true MOCK_ELEVENLABS=true MOCK_BGG=true MOCK_EXTRACT_PICS=true npm start
   ```

## CI/CD Integration

### Non-blocking Monitoring
The network probe runs as a separate, non-blocking CI job to avoid disrupting the main build pipeline:

```yaml
# Always continue even if network probe fails
continue-on-error: true

# Upload artifacts for post-mortem analysis
uses: actions/upload-artifact@v4
with:
  retention-days: 7
```

### Automated Alerting
- PR comments posted when connectivity issues detected
- Scheduled runs every 6 hours to catch intermittent issues
- Artifacts uploaded for detailed analysis

## Mock Mode for Development

When external APIs are unavailable, use mock mode to continue development:

```bash
# Enable all mocks
export MOCK_OPENAI=true
export MOCK_ELEVENLABS=true
export MOCK_BGG=true
export MOCK_EXTRACT_PICS=true

# Run network probe
npm run network:test
```

Mock mode simulates successful connectivity tests and returns appropriate exit codes for CI integration.

## Escalation Procedures

### Level 1: Developer Self-Service
1. Run network diagnostics: `npm run network:probe`
2. Check common issues in this guide
3. Test with mock mode to isolate network vs. application issues
4. Try from different network (mobile hotspot, home network)

### Level 2: Infrastructure Team
If issues persist after Level 1 troubleshooting:
1. Provide network diagnostic artifacts from CI run
2. Include specific error messages and timestamps
3. Document any recent network/security changes
4. Attach output from manual diagnostic commands

### Level 3: Vendor Support
For persistent API-specific issues:
1. Contact API provider support with diagnostic evidence
2. Include request/response logs (sanitized)
3. Provide geographic location and ISP information
4. Document any error codes or rate limiting messages

## Monitoring and Metrics

### Key Metrics to Track
- **Success rate:** Percentage of successful connectivity tests
- **Latency:** Response times for each endpoint
- **Error patterns:** Common failure modes and frequencies
- **Geographic distribution:** Issues by region/ISP

### Alerting Thresholds
- **Critical:** All endpoints failing for >15 minutes
- **Warning:** >50% endpoints failing for >5 minutes
- **Info:** Individual endpoint failures or high latency

## Related Documentation
- [API Integration Guide](api-integration.md) - Application-level API usage
- [Deployment Guide](deployment.md) - Environment-specific configuration
- [Security Guide](security.md) - Certificate and authentication management