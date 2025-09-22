# Network Troubleshooting Guide

This guide helps diagnose and resolve network connectivity issues in CI and staging environments, particularly for external API dependencies.

## Quick Diagnosis

### Step 1: Run Network Probe
```bash
./scripts/network-probe.sh
```

This performs basic connectivity tests to critical endpoints:
- `api.openai.com` (OpenAI API)
- `api.elevenlabs.io` (ElevenLabs TTS API)
- Reference endpoints for comparison

### Step 2: Run Full Diagnostics (if issues found)
```bash
./scripts/network-diagnostics.sh
```

This provides comprehensive analysis including:
- DNS resolution with multiple resolvers
- SSL/TLS certificate validation
- Traceroute analysis
- System network configuration
- Detailed recommendations

### Step 3: Generate Infrastructure Report
```bash
./scripts/reproduce-blocked-endpoints.sh
```

This creates a detailed report for infrastructure teams with:
- Specific commands to run on affected systems
- Firewall configuration requirements
- Troubleshooting steps

## Common Issues and Solutions

### DNS Resolution Failures

**Symptoms:**
- `Name or service not known` errors
- DNS timeout messages
- Applications can't resolve API hostnames

**Solutions:**
1. Check DNS servers in `/etc/resolv.conf`
2. Try alternative DNS servers:
   ```bash
   echo "nameserver 8.8.8.8" >> /etc/resolv.conf
   echo "nameserver 1.1.1.1" >> /etc/resolv.conf
   ```
3. Test DNS resolution manually:
   ```bash
   nslookup api.openai.com 8.8.8.8
   dig @1.1.1.1 api.elevenlabs.io
   ```

### Firewall Blocking

**Symptoms:**
- `Connection refused` errors
- `Connection timed out` messages
- Port connectivity tests fail

**Solutions:**
1. Add required domains to firewall allowlist:
   - `api.openai.com` (port 443)
   - `api.elevenlabs.io` (port 443)
2. Test port connectivity:
   ```bash
   nc -z -v api.openai.com 443
   telnet api.openai.com 443
   ```
3. Check corporate firewall rules with network team

### SSL/TLS Certificate Issues

**Symptoms:**
- Certificate verification errors
- SSL handshake failures
- TLS connection problems

**Solutions:**
1. Check if corporate proxy is performing TLS MITM
2. Verify certificate chain:
   ```bash
   openssl s_client -connect api.openai.com:443 -servername api.openai.com
   ```
3. Update certificate store if needed
4. Consider disabling certificate verification temporarily for testing (not recommended for production)

### Proxy Configuration Issues

**Symptoms:**
- Applications work locally but fail in CI/staging
- Proxy authentication errors
- Connection through proxy fails

**Solutions:**
1. Check proxy environment variables:
   ```bash
   echo $HTTP_PROXY
   echo $HTTPS_PROXY
   echo $NO_PROXY
   ```
2. Configure proxy for specific applications
3. Add API domains to NO_PROXY if they should bypass proxy
4. Test proxy connectivity:
   ```bash
   curl -x $HTTP_PROXY https://api.openai.com/v1/models
   ```

## Environment-Specific Troubleshooting

### GitHub Actions / CI Environments

**Common Issues:**
- GitHub-hosted runners may have network restrictions
- Self-hosted runners may be behind corporate firewall
- Different network policies for public vs private repositories

**Solutions:**
1. Use self-hosted runners with known network access
2. Configure runner environment variables for proxy
3. Test network connectivity in CI workflow
4. Consider using IP allowlists if supported by APIs

### Docker/Container Environments

**Common Issues:**
- Container networking isolation
- DNS resolution differences
- Proxy configuration not inherited

**Solutions:**
1. Configure DNS in container:
   ```dockerfile
   RUN echo "nameserver 8.8.8.8" > /etc/resolv.conf
   ```
2. Pass proxy environment variables to container
3. Use host networking mode for testing
4. Check container network policies

### Kubernetes Environments

**Common Issues:**
- NetworkPolicies blocking egress traffic
- DNS resolution through cluster DNS
- Service mesh proxy interference

**Solutions:**
1. Check NetworkPolicies:
   ```bash
   kubectl get networkpolicies
   kubectl describe networkpolicy <policy-name>
   ```
2. Configure egress rules for external APIs
3. Test from pod directly:
   ```bash
   kubectl exec -it <pod> -- curl https://api.openai.com/v1/models
   ```

## Escalation Process

### When to Escalate to Infrastructure Team

Escalate when you encounter:
- Persistent DNS resolution failures
- Connection timeouts to multiple external services
- SSL/TLS handshake failures
- Firewall-related errors

### Information to Provide

When escalating, include:
1. Output from network diagnostic scripts
2. Specific error messages from applications
3. Network configuration details
4. Timestamp and environment information
5. Steps already attempted

### Working with Infrastructure Team

**Provide these specific requirements:**
- Domain allowlist: `api.openai.com`, `api.elevenlabs.io`
- Protocol: HTTPS (port 443)
- Direction: Outbound from CI/staging environments
- Frequency: Regular API calls during application operation

**Ask them to run these diagnostic commands:**
```bash
nslookup api.openai.com
dig +short api.openai.com
traceroute -m 30 api.openai.com
curl -v --max-time 15 https://api.openai.com/v1/models
```

## Monitoring and Prevention

### Regular Network Health Checks

1. Include network probe in CI pipeline
2. Monitor API response times and error rates
3. Set up alerts for network connectivity failures
4. Regular review of firewall rules and network policies

### Best Practices

1. **Fail Fast**: Test network connectivity early in deployment process
2. **Document Dependencies**: Maintain list of external APIs and requirements
3. **Environment Parity**: Ensure network configuration consistency across environments
4. **Fallback Plans**: Have alternative approaches when external APIs are unavailable
5. **Monitoring**: Implement comprehensive monitoring for network issues

## Related Documentation

- [Developer Network Guide](./developer-network-guide.md) - Setup and configuration for development
- Network Diagnostic Scripts:
  - `scripts/network-probe.sh` - Basic connectivity tests
  - `scripts/network-diagnostics.sh` - Comprehensive analysis
  - `scripts/reproduce-blocked-endpoints.sh` - Infrastructure team support

## Support

For additional support:
1. Check application logs for specific error messages
2. Run diagnostic scripts and share output
3. Contact infrastructure team with detailed information
4. Consider temporary workarounds while issues are resolved