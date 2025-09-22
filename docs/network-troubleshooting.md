# Network Troubleshooting Guide for Infrastructure Teams

This guide provides infrastructure teams with diagnostic procedures and remediation steps for network connectivity issues affecting the mobius-games-tutorial-generator application.

## Quick Start for Infrastructure Teams

When CI/staging failures occur with network timeouts or connection errors to external APIs, run these commands on the affected runner and attach outputs to tickets:

```bash
# Quick diagnostic commands to run on failing runner
nslookup api.openai.com
dig +short api.openai.com
traceroute -m 30 api.openai.com
curl -v --max-time 15 https://api.openai.com/v1/models

# Repeat for all blocked hosts
nslookup api.elevenlabs.io
dig +short api.elevenlabs.io
traceroute -m 30 api.elevenlabs.io
curl -v --max-time 15 https://api.elevenlabs.io/v1/
```

## Required External Endpoints

The application requires outbound HTTPS (port 443) access to:

- **api.openai.com** - OpenAI API for content generation
- **api.elevenlabs.io** - ElevenLabs API for voice synthesis

Additional hosts may be configured via `EXTRA_NETWORK_HOSTS` environment variable.

## Common Issues and Remediation

### 1. DNS Resolution Failures

**Symptoms:**
- `nslookup` or `dig` commands fail
- Error messages: "Name or service not known", "NXDOMAIN"

**Diagnostics:**
```bash
# Check system DNS configuration
cat /etc/resolv.conf

# Test with different DNS servers
dig @8.8.8.8 api.openai.com
dig @1.1.1.1 api.openai.com
```

**Remediation:**
- Verify corporate DNS servers can resolve external domains
- Check if DNS filtering/blocking is applied to these domains
- Ensure runners use appropriate DNS servers in `/etc/resolv.conf`
- Consider DNS forwarding rules for these specific domains

### 2. Firewall/Egress Restrictions

**Symptoms:**
- DNS resolves correctly but TCP connections fail
- `nc` or `telnet` connections timeout
- curl fails with "Connection timed out"

**Diagnostics:**
```bash
# Test TCP connectivity
nc -v -z api.openai.com 443
telnet api.openai.com 443

# Check routing
traceroute api.openai.com
ip route get $(dig +short api.openai.com | head -n1)
```

**Remediation:**
- Verify outbound firewall rules allow HTTPS (port 443) to these hosts
- Check if IP-based filtering is applied (hosts may resolve to different IPs)
- Consider hostname-based allow rules instead of IP-based
- Verify no intermediate firewalls or security appliances are blocking

### 3. Corporate Proxy/MITM Issues

**Symptoms:**
- TCP connections succeed but HTTPS/TLS fails
- Certificate validation errors
- Curl works with `-k` (ignore certificates) but fails normally

**Diagnostics:**
```bash
# Check for proxy configuration
env | grep -i proxy

# Test TLS certificate chain
openssl s_client -connect api.openai.com:443 -servername api.openai.com

# Test with explicit proxy bypass
NO_PROXY=api.openai.com,api.elevenlabs.io curl -v https://api.openai.com/v1/models
```

**Remediation:**
- If corporate proxy/MITM is re-signing certificates, ensure corporate CA is trusted
- Add corporate CA certificate to system trust store
- For Node.js applications, set `NODE_EXTRA_CA_CERTS` environment variable
- Consider proxy bypass rules for these API endpoints
- Verify proxy can handle the specific TLS/SSL requirements of these APIs

### 4. Rate Limiting/WAF Blocks

**Symptoms:**
- Initial connections work but subsequent requests fail
- HTTP 429 (Too Many Requests) or 403 (Forbidden) responses
- Success from developer machines but failures from CI/staging

**Diagnostics:**
```bash
# Test with different User-Agent strings
curl -H "User-Agent: MyApp/1.0" https://api.openai.com/v1/models

# Check response headers for rate limit information
curl -I https://api.openai.com/v1/models
```

**Remediation:**
- Check if CI runner IP addresses are being rate-limited or blocked
- Implement proper API rate limiting in application code
- Use API keys and proper authentication headers
- Consider IP whitelisting with API providers if needed
- Stagger CI runs to avoid simultaneous API calls

## Network Architecture Considerations

### Recommended Infrastructure Setup

1. **DNS Configuration**
   - Ensure corporate DNS can resolve external API hostnames
   - Consider split-horizon DNS if internal/external resolution differs
   - Document any DNS filtering or modification policies

2. **Firewall Rules**
   - Allow outbound HTTPS (443) to `api.openai.com` and `api.elevenlabs.io`
   - Consider FQDN-based rules rather than IP-based (IPs may change)
   - Document any content filtering or DPI rules that might affect API calls

3. **Proxy Configuration**
   - If corporate proxy is required, ensure it can handle API-style HTTPS traffic
   - Configure appropriate bypass rules for API endpoints if needed
   - Ensure proxy doesn't modify or cache API responses inappropriately

4. **Certificate Management**
   - If using corporate MITM, ensure runners trust the corporate CA
   - Keep certificate stores updated
   - Monitor for certificate expiration on API endpoints

## Diagnostic Script Usage

The repository includes diagnostic scripts for systematic troubleshooting:

### Quick Probe
```bash
# Run on failing runner
./scripts/network-probe.sh

# With additional hosts
EXTRA_NETWORK_HOSTS="example.com,another.host" ./scripts/network-probe.sh
```

### Comprehensive Diagnostics
```bash
# Generate full diagnostic report
./scripts/network-diagnostics.sh > /tmp/network-diagnostics-$(date +"%Y%m%dT%H%M%S").txt

# With custom output file
./scripts/network-diagnostics.sh --output /path/to/diagnostics.txt
```

### Local Reproduction
```bash
# Block endpoints to reproduce issues locally (requires sudo)
sudo ./scripts/reproduce-blocked-endpoints.sh --block-all

# Test your application to observe failures

# Restore normal connectivity
sudo ./scripts/reproduce-blocked-endpoints.sh --restore
```

## Escalation Procedures

### Level 1: Initial Triage
1. Run quick diagnostic commands listed at the top
2. Check common issues (DNS, firewall, proxy)
3. Verify issue is network-related, not application code

### Level 2: Detailed Analysis
1. Run comprehensive diagnostics script
2. Compare working vs. failing environments
3. Check for recent network/security policy changes

### Level 3: Infrastructure Changes
1. Implement remediation based on diagnostics
2. Test changes in staging environment first
3. Document changes and update monitoring

## Monitoring and Alerting

### Recommended Monitoring
- Synthetic transaction tests to API endpoints from runner networks
- DNS resolution monitoring for required hostnames
- Certificate expiration monitoring
- Network path availability (ping, traceroute automation)

### Key Metrics
- API response times and success rates from CI/staging networks
- DNS resolution times
- TLS handshake success rates
- Certificate validation success rates

## Emergency Contacts

When network issues are blocking critical deployments:
1. Check this guide and run diagnostics first
2. Include diagnostic outputs in escalation tickets
3. Specify impact (CI only, staging only, or production-affecting)
4. Reference this documentation in tickets

## Related Documentation

- [Developer Network Guide](./developer-network-guide.md) - For developers troubleshooting locally
- CI/CD Pipeline Documentation - For understanding how network probes integrate with builds
- Corporate Network Security Policies - For understanding organizational constraints