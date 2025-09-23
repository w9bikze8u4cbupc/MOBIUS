# Network Troubleshooting Guide

This guide helps diagnose and resolve network connectivity issues detected by the CI/CD network monitoring system.

## Quick Diagnostics

When the network probe detects failures, use these commands from the failing environment:

### DNS Resolution Testing
```bash
# Test DNS resolution
dig +short api.openai.com
dig +short api.elevenlabs.io  
dig +short boardgamegeek.com
dig +short extract.pics

# Alternative (if dig unavailable)
nslookup api.openai.com
nslookup api.elevenlabs.io
```

### TCP Connectivity Testing
```bash
# Test TCP connectivity
nc -vz api.openai.com 443
nc -vz api.elevenlabs.io 443
nc -vz boardgamegeek.com 443
nc -vz extract.pics 443

# Alternative for Windows or if nc unavailable
telnet api.openai.com 443
```

### HTTP/HTTPS Testing
```bash
# Test HTTPS connectivity
curl -v --max-time 10 https://api.openai.com/v1/models
curl -v --max-time 10 https://api.elevenlabs.io/v1/voices
curl -v --max-time 10 https://boardgamegeek.com/xmlapi2/
curl -v --max-time 10 https://extract.pics

# Alternative (if curl unavailable)
wget --timeout=10 -O /dev/null https://api.openai.com/v1/models
```

### TLS Handshake Testing
```bash
# Test TLS handshake
echo "Q" | openssl s_client -connect api.openai.com:443 -servername api.openai.com
echo "Q" | openssl s_client -connect api.elevenlabs.io:443 -servername api.elevenlabs.io
echo "Q" | openssl s_client -connect boardgamegeek.com:443 -servername boardgamegeek.com
echo "Q" | openssl s_client -connect extract.pics:443 -servername extract.pics
```

### Network Tracing
```bash
# Linux/macOS
traceroute -n api.openai.com
traceroute -n api.elevenlabs.io

# Windows
tracert api.openai.com
tracert api.elevenlabs.io
```

## Common Failure Modes & Solutions

### 1. DNS Resolution Failures

**Symptoms:** `DNS NXDOMAIN` or empty resolution results

**Common Causes:**
- DNS resolver misconfiguration
- Split-horizon DNS issues
- DNS filtering/blocking

**Solutions:**
```bash
# Check DNS resolver
cat /etc/resolv.conf  # Linux
scutil --dns           # macOS
ipconfig /all          # Windows

# Try alternative DNS servers
dig @8.8.8.8 api.openai.com
dig @1.1.1.1 api.openai.com
```

### 2. TCP Connection Failures

**Symptoms:** `Connection refused`, `Timeout`, or `No route to host`

**Common Causes:**
- Firewall blocking outbound connections
- Security group misconfigurations
- NAT gateway issues
- IP blocklists

**Solutions:**
- Review VPC/security group outbound rules (allow ports 80, 443)
- Check NAT gateway and routing tables
- Verify firewall policies
- Contact service providers about IP allowlists

### 3. HTTP/HTTPS Failures

**Symptoms:** HTTP error codes, timeouts, or connection refused

**Common Causes:**
- Proxy server issues
- HTTP intercepting firewalls
- Rate limiting
- API key requirements

**Solutions:**
```bash
# Check proxy settings
env | grep -i proxy
curl --proxy-insecure -v https://api.openai.com/v1/models

# Bypass proxy (if safe)
unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY
```

### 4. TLS Handshake Failures

**Symptoms:** SSL/TLS certificate errors, handshake failures

**Common Causes:**
- Corporate TLS inspection
- Outdated CA certificate store
- SNI (Server Name Indication) issues
- SSL/TLS version mismatches

**Solutions:**
```bash
# Check TLS versions supported
openssl s_client -connect api.openai.com:443 -tls1_2
openssl s_client -connect api.openai.com:443 -tls1_3

# Check certificate chain
openssl s_client -connect api.openai.com:443 -showcerts

# Update CA certificates
# Ubuntu/Debian: sudo apt-get update && sudo apt-get install ca-certificates
# RHEL/CentOS: sudo yum update ca-certificates
# macOS: brew install ca-certificates
```

## Infrastructure Remediation Checklist

### Cloud Platforms (AWS/Azure/GCP)

- [ ] **VPC/Network Security Groups**
  - Verify outbound rules allow HTTPS (port 443) to 0.0.0.0/0
  - Check outbound rules allow HTTP (port 80) if needed
  - Ensure DNS (port 53) is allowed

- [ ] **NAT Gateway/NAT Instance**
  - Verify NAT gateway is healthy and properly configured
  - Check route tables point to NAT gateway for private subnets
  - Ensure NAT gateway has sufficient bandwidth allocation

- [ ] **Load Balancers/Proxies**
  - Check proxy server health and configuration
  - Verify proxy allows outbound connections to target APIs
  - Review proxy logs for blocked requests

### Corporate Networks

- [ ] **Firewall Rules**
  - Allow outbound HTTPS (443) to target domains
  - Whitelist specific API endpoints if needed
  - Check for time-based restrictions

- [ ] **DNS Configuration**
  - Verify internal DNS forwards external queries
  - Check for DNS filtering/content blocking
  - Test with public DNS servers (8.8.8.8, 1.1.1.1)

- [ ] **TLS Inspection**
  - Configure corporate CA certificates in CI/CD runners
  - Whitelist API domains from TLS inspection if possible
  - Update certificate stores regularly

### Service Provider Considerations

- [ ] **IP Allowlists**
  - Register CI/CD runner IP ranges with service providers
  - Use static IP addresses or NAT gateways with fixed IPs
  - Monitor for IP changes in dynamic environments

- [ ] **Rate Limiting**
  - Implement exponential backoff in API clients
  - Use API keys for higher rate limits where available
  - Distribute load across multiple IP addresses if needed

## Escalation Procedures

### Level 1: Development Team
- Review network probe artifacts and logs
- Check recent changes to network configuration
- Verify API key validity and service status

### Level 2: Infrastructure Team
- Investigate firewall and security group configurations
- Check NAT gateway, proxy, and DNS health
- Review monitoring for network infrastructure issues

### Level 3: Network Operations
- Engage with ISP/cloud provider support
- Investigate routing and BGP issues
- Coordinate with service provider technical support

## Artifacts for Escalation

When escalating network issues, attach these files:

- `network-diagnostics.json` - Machine-readable test results
- `network-probe.log` - Human-readable diagnostic log  
- `traceroute.log` - Network path analysis
- `dig.log` - DNS resolution details
- `openssl.log` - TLS handshake diagnostics

## Mock Mode for Development

Use mock mode to bypass network tests during development:

```bash
# Via npm scripts
npm run network:test

# Via environment variables
MOCK_OPENAI=true MOCK_ELEVENLABS=true MOCK_BGG=true MOCK_EXTRACT_PICS=true npm run network:probe

# Individual service mocking
MOCK_OPENAI=true ./scripts/network-probe.sh
```

## Monitoring and Alerting

The network probe runs automatically:

- **Push/PR Events:** Immediate feedback on connectivity changes
- **Scheduled Runs:** Every 6 hours for continuous monitoring
- **Manual Triggers:** Available through GitHub Actions UI

Configure additional monitoring:

```yaml
# Add to monitoring systems
alerts:
  - name: "API Connectivity Failure"
    condition: "network_probe_failures > 0"
    severity: "warning"
    channels: ["#infrastructure", "#dev-ops"]
```

## Best Practices

1. **Non-blocking Tests:** Network tests should never block the main CI/CD pipeline
2. **Graceful Degradation:** Use mock mode when external services are unavailable
3. **Timeout Protection:** All network tests should have reasonable timeouts
4. **Artifact Retention:** Keep diagnostic artifacts for at least 7 days
5. **Regular Updates:** Keep network monitoring tools and scripts updated

## Support Contacts

- **Internal Infrastructure:** `#infrastructure` Slack channel
- **Cloud Provider Support:** Use support cases for cloud platform issues
- **Service Provider Support:** 
  - OpenAI: [OpenAI Support](https://help.openai.com/)
  - ElevenLabs: [ElevenLabs Support](https://elevenlabs.io/support)
  - BoardGameGeek: [BGG Contact](https://boardgamegeek.com/contact)
  - Extract.pics: Check service documentation for support channels