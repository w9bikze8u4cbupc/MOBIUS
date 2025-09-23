# Network Troubleshooting Guide

This document provides guidance for diagnosing and resolving network connectivity issues that may affect the Mobius Games Tutorial Generator's external API dependencies.

## External API Dependencies

The application relies on the following external services:

- **OpenAI API** (`api.openai.com:443`) - Used for AI text processing and component identification
- **ElevenLabs API** (`api.elevenlabs.io:443`) - Used for text-to-speech conversion
- **BoardGameGeek** (`boardgamegeek.com:443`) - Used for board game metadata and information  
- **Extract Pics API** (`api.extract.pics:443`) - Used for image extraction from URLs

## Automatic Network Probing

The repository includes an automated network probe script (`scripts/network-probe.sh`) that runs as part of CI to detect egress failures early. This script generates several diagnostic artifacts:

- `network-probe.log` - Human-readable diagnostic output
- `network-diagnostics.json` - Structured JSON report for automated parsing
- `traceroute.log` - Network path tracing information
- `dig.log` - DNS resolution details
- `openssl.log` - TLS handshake diagnostics

## Quick Diagnostic Commands

### DNS Resolution
```bash
# Test DNS resolution for each service
dig +short api.openai.com
dig +short api.elevenlabs.io  
dig +short boardgamegeek.com
dig +short api.extract.pics
```

### TCP Connectivity
```bash
# Test TCP reachability
nc -vz api.openai.com 443
nc -vz api.elevenlabs.io 443
nc -vz boardgamegeek.com 443
nc -vz api.extract.pics 443
```

### HTTP/HTTPS Connectivity
```bash
# Test HTTP connectivity with verbose output
curl -v --max-time 10 https://api.openai.com/v1/models
curl -v --max-time 10 https://api.elevenlabs.io/v1/voices
curl -v --max-time 10 https://boardgamegeek.com/xmlapi2/hot?type=boardgame
curl -v --max-time 10 https://api.extract.pics/
```

### TLS Handshake Testing
```bash
# Test TLS handshakes
openssl s_client -connect api.openai.com:443 -servername api.openai.com
openssl s_client -connect api.elevenlabs.io:443 -servername api.elevenlabs.io
openssl s_client -connect boardgamegeek.com:443 -servername boardgamegeek.com
openssl s_client -connect api.extract.pics:443 -servername api.extract.pics
```

### Network Path Tracing
```bash
# Trace network path to identify where connectivity fails
traceroute -n api.openai.com
traceroute -n api.elevenlabs.io
traceroute -n boardgamegeek.com
traceroute -n api.extract.pics
```

### Local Firewall Check (Linux)
```bash
# Check local firewall rules
sudo iptables -L -n
sudo ufw status verbose
```

## Common Failure Modes and Solutions

### 1. Timeout / SYN No Response
**Symptoms:** Connection attempts time out, no response to SYN packets
**Likely Cause:** Egress blocked by firewall, NAT, or cloud security groups
**Solution:** 
- Allow outbound traffic on port 443 to required hosts
- Configure approved proxy/NAT for external connections
- Update cloud provider security groups to allow HTTPS egress

### 2. Connection Refused / RST
**Symptoms:** Connection actively refused, RST packets received
**Likely Cause:** Target host reachable but rejecting connections (IP-range blocklist, upstream ACLs)
**Solution:**
- Check with infrastructure team and service provider
- Some APIs block cloud provider IP ranges - consider using proxy
- Verify API keys and service account access

### 3. DNS NXDOMAIN / Incorrect IP
**Symptoms:** DNS resolution fails or returns wrong IP addresses
**Likely Cause:** DNS resolver misconfiguration or DNS-level blocking
**Solution:**
```bash
# Check resolver configuration
cat /etc/resolv.conf

# Try different DNS servers
dig @8.8.8.8 api.openai.com
dig @1.1.1.1 api.openai.com
```

### 4. TLS Handshake / Certificate Errors
**Symptoms:** TLS handshake fails, certificate validation errors
**Likely Cause:** TLS inspection by corporate proxy or stale CA bundle
**Solution:**
- Coordinate with security team to allow specific targets
- Update CA trust store
- Check for certificate transparency logs

## Environment Variables for Mock Mode

To handle external API failures gracefully, the application supports mock modes through environment variables:

```bash
# Enable mock mode when external APIs are unavailable
export MOCK_OPENAI=true
export MOCK_ELEVENLABS=true
export MOCK_BGG=true
export MOCK_EXTRACT_PICS=true
```

## CI Integration

The network probe runs automatically in CI as the first step to detect connectivity issues early. When failures are detected:

1. **Non-blocking**: The build continues with external-dependent jobs marked as skipped
2. **Artifacts**: Network diagnostic files are uploaded for analysis
3. **Alerts**: Structured JSON output enables automated notifications

### Manual Probe Execution

Run the network probe manually:

```bash
# Create artifacts directory and run probe
mkdir -p artifacts
bash scripts/network-probe.sh artifacts

# Check results
echo "Exit code: $?"
cat artifacts/network-diagnostics.json | jq .summary
```

## Escalation Process

1. **Immediate**: Check probe artifacts in the failing CI run
2. **Short-term**: Use mock modes to unblock development
3. **Long-term**: Work with infrastructure team to:
   - Whitelist required API hosts/ports in egress rules
   - Configure approved proxy routing
   - Update certificate trust if TLS is intercepted

## Application Resilience Features

The application includes several resilience patterns:
- **Retry Logic**: Exponential backoff with capped attempts
- **Circuit Breakers**: Fast failure when external services are down
- **Structured Logging**: JSON logs with timestamp, target, status, latency
- **Graceful Degradation**: Core functionality works without external APIs

## Log Analysis

Look for these patterns in application logs:

```json
{
  "timestamp": "2025-09-22T19:30:04Z",
  "area": "api",
  "action": "openai_request", 
  "target": "api.openai.com",
  "status": "timeout",
  "latency_ms": 10000,
  "error": "Connection timed out"
}
```

Common error indicators:
- `"status": "timeout"` - Network connectivity issue
- `"status": "connection_refused"` - Service blocking or down
- `"status": "dns_error"` - DNS resolution failure
- `"status": "tls_error"` - Certificate or TLS handshake issue

## Support Contacts

- **Infrastructure Issues**: Tag @infra-team in GitHub issues
- **Security/Firewall**: Contact security team for egress rule updates  
- **Emergency**: Use mock mode environment variables for immediate unblocking