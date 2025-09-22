# Network Connectivity Troubleshooting Guide

This document provides guidance for diagnosing and resolving network connectivity issues in the Mobius Games Tutorial Generator, particularly when external API calls fail during CI/CD runs or local development.

## Overview

The tutorial generator depends on several external APIs:
- **OpenAI API** (`api.openai.com`) - For AI-powered content generation
- **ElevenLabs API** (`api.elevenlabs.io`) - For text-to-speech generation  
- **BoardGameGeek API** (`boardgamegeek.com`) - For game metadata and images

Network connectivity issues can cause builds to fail or produce incomplete results.

## Quick Diagnostics

### Automated Network Probe

The repository includes an automated network probe script that tests connectivity to all external dependencies:

```bash
./scripts/network-probe.sh [output_directory]
```

This generates:
- `network-probe.log` - Raw diagnostic output
- `network-diagnostics.json` - Structured test results

### Manual Testing Commands

Test each service manually with these commands:

```bash
# DNS resolution
dig +short api.openai.com
dig +short api.elevenlabs.io
dig +short boardgamegeek.com

# TCP connectivity  
nc -vz api.openai.com 443
nc -vz api.elevenlabs.io 443
nc -vz boardgamegeek.com 443

# HTTP connectivity
curl -v --max-time 10 https://api.openai.com/v1/models
curl -v --max-time 10 https://api.elevenlabs.io
curl -v --max-time 10 https://boardgamegeek.com/xmlapi2

# TLS handshake inspection
openssl s_client -connect api.openai.com:443 -servername api.openai.com
openssl s_client -connect api.elevenlabs.io:443 -servername api.elevenlabs.io

# Network routing
traceroute -n api.openai.com
traceroute -n api.elevenlabs.io
traceroute -n boardgamegeek.com
```

## Common Failure Modes

### 1. DNS Resolution Failures

**Symptoms:**
- `Could not resolve host` errors
- Empty or `0.0.0.0` responses from `dig`
- `NXDOMAIN` responses

**Diagnostic Commands:**
```bash
# Check current DNS resolver
cat /etc/resolv.conf

# Test with different DNS servers
dig @8.8.8.8 api.openai.com
dig @1.1.1.1 api.openai.com

# Check for DNS blocking
nslookup api.openai.com
```

**Common Causes:**
- Corporate DNS filtering/blocking
- Split-horizon DNS configuration
- DNS server timeouts or failures
- Firewall blocking DNS queries (port 53)

**Solutions:**
- Configure alternative DNS servers
- Add DNS overrides for blocked domains
- Contact network administrator to whitelist domains

### 2. TCP Connection Failures

**Symptoms:**
- `Connection refused` errors
- `Connection timed out` errors
- Successful DNS but failed TCP connections

**Diagnostic Commands:**
```bash
# Test TCP connectivity
telnet api.openai.com 443
nc -vz api.openai.com 443

# Check local firewall rules (Linux)
sudo iptables -L -n
sudo ufw status verbose

# Check if port 443 is filtered
nmap -p 443 api.openai.com
```

**Common Causes:**
- Firewall blocking outbound HTTPS (port 443)
- IP-based blocking or geofencing
- NAT/proxy configuration issues
- Cloud provider security groups

**Solutions:**
- Update firewall rules to allow outbound HTTPS
- Configure corporate proxy settings
- Use VPN or different network location
- Contact infrastructure team to update security groups

### 3. HTTP/HTTPS Request Failures

**Symptoms:**
- HTTP 4xx/5xx error codes
- SSL/TLS handshake failures
- Request timeouts with successful TCP connection

**Diagnostic Commands:**
```bash
# Verbose HTTP request
curl -v --max-time 10 https://api.openai.com/v1/models

# Test with different User-Agent
curl -H "User-Agent: Mozilla/5.0" https://api.openai.com/v1/models

# Check SSL certificate
curl -vI https://api.openai.com

# Test without SSL verification (debugging only)
curl -k https://api.openai.com/v1/models
```

**Common Causes:**
- TLS interception by corporate proxy
- Outdated CA certificate bundle
- User-Agent filtering
- API key authentication issues
- Rate limiting or API quotas

**Solutions:**
- Update CA certificates: `sudo apt-get update && sudo apt-get install ca-certificates`
- Configure corporate proxy certificates
- Use appropriate User-Agent headers
- Verify API keys and quotas

## CI/CD Troubleshooting

### GitHub Actions Issues

If network probes fail in GitHub Actions:

1. **Check runner location**: Different runners may have different network access
2. **Review security policies**: GitHub may block certain external connections
3. **Use network diagnostics artifacts**: Download and review the uploaded diagnostics

### Self-Hosted Runners

For self-hosted runners experiencing issues:

1. **Verify runner network access**: Test connectivity from the runner host
2. **Check corporate firewall**: Ensure runner can access external APIs
3. **Update runner software**: Ensure latest runner version with current CA certificates

## Environment-Specific Solutions

### Corporate Networks

```bash
# Check for corporate proxy
echo $HTTP_PROXY
echo $HTTPS_PROXY
echo $NO_PROXY

# Configure git for corporate proxy
git config --global http.proxy http://proxy.company.com:8080
git config --global https.proxy https://proxy.company.com:8080

# Test with proxy
curl --proxy http://proxy.company.com:8080 https://api.openai.com
```

### Cloud Environments

**AWS:**
- Check Security Groups for outbound rules
- Verify NAT Gateway configuration
- Review VPC routing tables

**Azure:**
- Check Network Security Groups (NSGs)
- Verify outbound connectivity rules
- Review User Defined Routes (UDRs)

**GCP:**
- Check firewall rules for egress
- Verify Cloud NAT configuration
- Review VPC network policies

## Application-Level Resilience

### Retry Logic

Implement exponential backoff for API calls:

```javascript
async function apiCallWithRetry(url, options, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return response;
      if (response.status >= 400 && response.status < 500) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      const delay = Math.min(1000 * Math.pow(2, i), 10000);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
```

### Circuit Breaker Pattern

```javascript
class CircuitBreaker {
  constructor(threshold = 5, timeout = 60000) {
    this.threshold = threshold;
    this.timeout = timeout;
    this.failures = 0;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.nextAttempt = null;
  }
  
  async call(fn) {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttempt) {
        throw new Error('Circuit breaker is OPEN');
      }
      this.state = 'HALF_OPEN';
    }
    
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  onSuccess() {
    this.failures = 0;
    this.state = 'CLOSED';
  }
  
  onFailure() {
    this.failures++;
    if (this.failures >= this.threshold) {
      this.state = 'OPEN';
      this.nextAttempt = Date.now() + this.timeout;
    }
  }
}
```

### Mock/Fallback Services

For development environments, consider using mock services:

```javascript
const USE_MOCK_APIS = process.env.MOCK_APIS === 'true';

class APIService {
  constructor() {
    this.openai = USE_MOCK_APIS ? new MockOpenAI() : new RealOpenAI();
    this.elevenlabs = USE_MOCK_APIS ? new MockElevenLabs() : new RealElevenLabs();
  }
}
```

## Monitoring and Alerting

### Structured Logging

Log network errors with structured data:

```javascript
function logNetworkError(service, error, context = {}) {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'error',
    service: service,
    error_type: 'network_failure',
    error_message: error.message,
    error_code: error.code,
    ...context
  }));
}
```

### Health Checks

Implement health check endpoints that test external dependencies:

```javascript
app.get('/health', async (req, res) => {
  const checks = await Promise.allSettled([
    checkOpenAI(),
    checkElevenLabs(),
    checkBoardGameGeek()
  ]);
  
  const results = checks.map((result, index) => ({
    service: ['openai', 'elevenlabs', 'bgg'][index],
    status: result.status === 'fulfilled' ? 'healthy' : 'unhealthy',
    error: result.status === 'rejected' ? result.reason.message : null
  }));
  
  const allHealthy = results.every(r => r.status === 'healthy');
  res.status(allHealthy ? 200 : 503).json({ checks: results });
});
```

## Getting Help

If network issues persist after following this guide:

1. **Collect diagnostics**: Run the network probe script and collect all outputs
2. **Document environment**: Note operating system, network configuration, proxy settings
3. **Contact support**: Provide diagnostics and environment details
4. **Check service status**: Verify external API service status pages:
   - [OpenAI Status](https://status.openai.com/)
   - [ElevenLabs Status](https://status.elevenlabs.io/)
   - [BoardGameGeek](https://boardgamegeek.com/)

## References

- [curl manual](https://curl.se/docs/manpage.html)
- [dig manual](https://linux.die.net/man/1/dig)  
- [netcat manual](https://linux.die.net/man/1/nc)
- [OpenSSL s_client](https://www.openssl.org/docs/man1.1.1/man1/openssl-s_client.html)
- [GitHub Actions networking](https://docs.github.com/en/actions/using-github-hosted-runners/about-github-hosted-runners#ip-addresses)