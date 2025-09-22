# Developer Network Guide

This guide helps developers use the network diagnostic tools, understand CI integration, and handle proxy/connectivity issues during development.

## Quick Start

### Running Network Probes

```bash
# Quick connectivity check
./scripts/network-probe.sh

# Test additional hosts
./scripts/network-probe.sh --extra-hosts "images.example.com,another.host"

# Use environment variable for extra hosts
EXTRA_NETWORK_HOSTS="custom.api.com" ./scripts/network-probe.sh
```

### Generating Diagnostic Reports

```bash
# Full diagnostics for infrastructure team
./scripts/network-diagnostics.sh > /tmp/network-diagnostics-$(date +"%Y%m%dT%H%M%S").txt

# Quick targeted diagnostics
./scripts/network-diagnostics.sh --extra-hosts "problematic.host.com"
```

### Local Issue Reproduction

```bash
# Block all API endpoints to test error handling
sudo ./scripts/reproduce-blocked-endpoints.sh --block-all

# Run your application to observe failures
npm start

# Restore connectivity when done
sudo ./scripts/reproduce-blocked-endpoints.sh --restore

# Check current blocking status
sudo ./scripts/reproduce-blocked-endpoints.sh --status
```

## CI Integration

### Automatic Network Probes

The CI workflow automatically runs network connectivity probes early in the build process:

```yaml
- name: Network connectivity probe
  run: ./scripts/network-probe.sh
  continue-on-error: true
  
- name: Upload network probe logs
  uses: actions/upload-artifact@v4
  with:
    name: network-probe-logs-${{ matrix.os }}
    path: /tmp/network-probe-*.log
```

### Key CI Features

- **Non-blocking**: Network probe failures don't fail the overall CI build
- **Artifact collection**: Probe logs are automatically uploaded as CI artifacts
- **Cross-platform**: Runs on Linux, macOS, and Windows runners
- **Early detection**: Runs before main build steps to identify network issues quickly

### Using CI Artifacts

1. Go to your PR or commit in GitHub
2. Scroll down to the "Checks" section
3. Click on the CI workflow run
4. Download the "network-probe-logs" artifacts
5. Share relevant logs with infrastructure team

## Development Environment Setup

### Proxy Configuration

If you're behind a corporate proxy, set these environment variables:

```bash
# HTTP/HTTPS proxy
export HTTP_PROXY=http://proxy.company.com:8080
export HTTPS_PROXY=http://proxy.company.com:8080

# No proxy for local/internal services
export NO_PROXY=localhost,127.0.0.1,.company.com

# For Node.js applications
export NODE_TLS_REJECT_UNAUTHORIZED=0  # Only if corporate MITM certificates
```

### Certificate Issues

If you encounter SSL/TLS certificate errors:

```bash
# For Node.js applications with corporate CA
export NODE_EXTRA_CA_CERTS=/path/to/corporate-ca.pem

# Temporary bypass for development (NOT for production)
export NODE_TLS_REJECT_UNAUTHORIZED=0
```

## Troubleshooting Common Development Issues

### 1. "Connection Refused" Errors

**Quick check:**
```bash
./scripts/network-probe.sh
```

**Common causes:**
- Firewall blocking outbound connections
- Proxy not configured properly
- VPN disconnected
- Corporate network restrictions

**Solutions:**
- Check proxy settings
- Try connecting to VPN if required
- Use diagnostic scripts to identify the specific failure point

### 2. DNS Resolution Issues

**Quick check:**
```bash
nslookup api.openai.com
dig api.openai.com
```

**Common causes:**
- Corporate DNS filtering
- VPN DNS settings
- Local DNS cache issues

**Solutions:**
```bash
# Clear DNS cache (macOS)
sudo dscacheutil -flushcache

# Clear DNS cache (Linux)
sudo systemctl restart systemd-resolved

# Try different DNS server
dig @8.8.8.8 api.openai.com
```

### 3. Certificate/TLS Errors

**Quick check:**
```bash
openssl s_client -connect api.openai.com:443
```

**Common causes:**
- Corporate MITM proxy
- Outdated certificate store
- Self-signed certificates in development

**Solutions:**
- Install corporate CA certificates
- Update system certificate store
- Configure Node.js to use corporate certificates

## Testing Network Error Handling

### Blocking Specific Endpoints

Test how your application handles network failures:

```bash
# Block only OpenAI API
sudo ./scripts/reproduce-blocked-endpoints.sh --block-host api.openai.com

# Test your application's error handling
npm test

# Restore when done
sudo ./scripts/reproduce-blocked-endpoints.sh --restore
```

### Simulating Different Failure Modes

```bash
# Complete network isolation
sudo ./scripts/reproduce-blocked-endpoints.sh --block-all

# Partial connectivity (block one API, leave others)
sudo ./scripts/reproduce-blocked-endpoints.sh --block-host api.openai.com

# Test with slow connections (not implemented, but can use traffic shaping)
```

## Environment Variables

### Standard Network Configuration

```bash
# Additional hosts to probe in network tests
export EXTRA_NETWORK_HOSTS="custom.api.com,images.cdn.com"

# Proxy configuration
export HTTP_PROXY=http://proxy.company.com:8080
export HTTPS_PROXY=http://proxy.company.com:8080
export NO_PROXY=localhost,127.0.0.1,.internal.com
```

### Application-Specific Variables

```bash
# API keys (keep these secure!)
export OPENAI_API_KEY="your-key-here"
export ELEVENLABS_API_KEY="your-key-here"

# Node.js certificate configuration
export NODE_EXTRA_CA_CERTS=/path/to/corporate-ca.pem
export NODE_TLS_REJECT_UNAUTHORIZED=1  # Always 1 in production
```

## Integration with Development Tools

### npm Scripts

The repository includes npm scripts for common network testing:

```bash
# Start server (used by CI)
npm run start:server

# Run network probe as part of development workflow
npm run network:probe  # (if added to package.json)
```

### IDE Integration

You can integrate the network probes into your IDE:

1. **VS Code**: Add tasks to `.vscode/tasks.json`
2. **IntelliJ**: Create run configurations
3. **Command line**: Add aliases to your shell profile

### Pre-commit Hooks

Consider adding network checks to pre-commit hooks for critical branches:

```bash
#!/bin/bash
# .git/hooks/pre-push
./scripts/network-probe.sh || echo "Warning: Network connectivity issues detected"
```

## Debugging Network Issues

### Verbose Logging

Enable verbose output in diagnostic scripts by modifying them or:

```bash
# Run with bash debugging
bash -x ./scripts/network-probe.sh

# Capture full output
./scripts/network-diagnostics.sh 2>&1 | tee debug.log
```

### Common Debugging Commands

```bash
# Check routing to API endpoints
traceroute api.openai.com
ip route get $(dig +short api.openai.com | head -n1)

# Test with different tools
curl -v --max-time 15 https://api.openai.com/v1/models
wget --timeout=15 https://api.openai.com/v1/models

# Check for proxy issues
curl --proxy "" https://api.openai.com/v1/models  # bypass proxy
```

## Working with Corporate Networks

### Common Corporate Network Setups

1. **HTTP Proxy Required**
   - Set `HTTP_PROXY` and `HTTPS_PROXY`
   - May require authentication: `http://user:pass@proxy:port`

2. **MITM/SSL Inspection**
   - Install corporate CA certificates
   - Configure Node.js to trust corporate CA
   - May need `NODE_TLS_REJECT_UNAUTHORIZED=0` temporarily

3. **Firewall Restrictions**
   - Only specific ports allowed outbound
   - Hostname-based filtering
   - May need to request firewall exceptions

### Getting Help from IT/Infrastructure

When requesting help from your IT/Infrastructure team:

1. **Run diagnostics first:**
   ```bash
   ./scripts/network-diagnostics.sh > diagnostics.txt
   ```

2. **Include specific error messages** from your application

3. **Mention which environments work vs. don't work**
   - "Works from home, fails in office"
   - "Works on Windows, fails on Linux"

4. **Reference the infrastructure guide**: Point them to `docs/network-troubleshooting.md`

## Best Practices

### Development Workflow

1. **Run network probe before starting development**
2. **Test error handling with blocked endpoints**
3. **Keep diagnostic logs when issues occur**
4. **Share network diagnostics with team when issues are environment-specific**

### Code Patterns

```javascript
// Good: Handle network errors gracefully
try {
  const response = await fetch('https://api.openai.com/v1/models');
  // handle response
} catch (error) {
  if (error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
    // Network connectivity issue
    console.log('Network connectivity issue detected');
    // fallback logic
  }
  throw error;
}

// Good: Implement retries with backoff
const response = await retry(() => 
  fetch('https://api.openai.com/v1/models'), 
  { retries: 3, factor: 2 }
);
```

## Related Documentation

- [Network Troubleshooting Guide](./network-troubleshooting.md) - For infrastructure teams
- CI/CD Pipeline Documentation - For understanding the full build process
- API Documentation - For specific API requirements and rate limits