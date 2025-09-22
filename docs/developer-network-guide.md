# Developer Guide: Network Connectivity Testing

## Overview

This guide helps developers test and reproduce network connectivity issues that might occur in staging, CI, or production environments where external APIs may be blocked or unreachable.

## Quick Start

### 1. Test Current Connectivity
```bash
# Run the network probe
./scripts/network-probe.sh

# Get detailed diagnostics
./scripts/network-diagnostics.sh
```

### 2. Reproduce Blocked Endpoints
```bash
# Block all external APIs for testing
./scripts/reproduce-blocked-endpoints.sh --block-all

# Test your application (should show connection errors)
npm run start

# Restore connectivity
./scripts/reproduce-blocked-endpoints.sh --restore
```

## External API Dependencies

### OpenAI API
- **Endpoint**: `https://api.openai.com`
- **Used for**: Text generation, rulebook analysis, component identification
- **Failure impact**: Cannot generate tutorial content

```bash
# Test OpenAI connectivity
curl -I https://api.openai.com/v1/models

# Simulate blocking
./scripts/reproduce-blocked-endpoints.sh --block-openai
```

### ElevenLabs API  
- **Endpoint**: `https://api.elevenlabs.io`
- **Used for**: Text-to-speech generation
- **Failure impact**: Cannot generate audio narration

```bash
# Test ElevenLabs connectivity
curl -I https://api.elevenlabs.io/v1/voices

# Simulate blocking
./scripts/reproduce-blocked-endpoints.sh --block-elevenlabs
```

### LibreTranslate (Local)
- **Endpoint**: `http://localhost:5002`
- **Used for**: Text translation
- **Failure impact**: Cannot translate content to other languages

```bash
# Check if running
curl -I http://localhost:5002/translate

# Start if needed (example)
docker run -d -p 5002:5000 libretranslate/libretranslate
```

## Development Workflows

### Testing Network Resilience

1. **Start with clean state**:
   ```bash
   ./scripts/reproduce-blocked-endpoints.sh --restore
   ./scripts/network-probe.sh
   ```

2. **Test individual API failures**:
   ```bash
   # Test OpenAI failure
   ./scripts/reproduce-blocked-endpoints.sh --block-openai
   # Run your app and verify error handling
   
   # Test ElevenLabs failure
   ./scripts/reproduce-blocked-endpoints.sh --restore
   ./scripts/reproduce-blocked-endpoints.sh --block-elevenlabs
   # Run your app and verify error handling
   ```

3. **Test complete network isolation**:
   ```bash
   ./scripts/reproduce-blocked-endpoints.sh --block-all
   # Your app should gracefully handle all API failures
   ```

4. **Always restore when done**:
   ```bash
   ./scripts/reproduce-blocked-endpoints.sh --restore
   ```

### Debugging Connection Issues

#### Common Error Patterns

**ECONNREFUSED**: Connection actively refused
```javascript
Error: connect ECONNREFUSED 127.0.0.1:443
```
- Usually means endpoint is blocked or service is down
- Check firewall rules and service status

**ETIMEDOUT**: Connection timeout
```javascript  
Error: connect ETIMEDOUT 104.18.7.192:443
```
- Network path issue or firewall dropping packets
- Use traceroute to diagnose network path

**ENOTFOUND**: DNS resolution failure
```javascript
Error: getaddrinfo ENOTFOUND api.openai.com
```
- DNS server cannot resolve the domain
- Check DNS configuration and domain status

#### Debugging Steps

1. **Check DNS resolution**:
   ```bash
   nslookup api.openai.com
   dig api.openai.com
   ```

2. **Test connectivity**:
   ```bash
   telnet api.openai.com 443
   curl -v https://api.openai.com/v1/models
   ```

3. **Trace network path**:
   ```bash
   traceroute api.openai.com
   ```

4. **Check application logs**:
   ```bash
   # Look for specific error patterns in your app logs
   grep -i "econnrefused\|etimedout\|enotfound" logs/app.log
   ```

## CI/CD Integration

### GitHub Actions Setup

The CI workflow now includes a network probe step:

```yaml
- name: Network Probe
  run: |
    echo "Testing network connectivity to external APIs..."
    chmod +x scripts/network-probe.sh
    ./scripts/network-probe.sh || echo "::warning::Network connectivity issues detected"
```

### Handling CI Network Issues

If CI builds fail due to network issues:

1. **Check the network probe step output**
2. **Review GitHub Actions logs for specific error messages**
3. **Consider adding retry logic or fallback mechanisms**
4. **Contact GitHub support if needed for firewall rules**

### Environment Variables for CI

Set these in your CI environment:
```bash
OPENAI_API_KEY=your_key_here
ELEVENLABS_API_KEY=your_key_here
```

## Error Handling Best Practices

### Implement Graceful Degradation

```javascript
// Example: Handle OpenAI API failures gracefully
async function generateWithFallback(prompt) {
  try {
    return await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: prompt }]
    });
  } catch (error) {
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      console.warn('OpenAI API unavailable, using fallback');
      return { content: '[Content generation unavailable - API connection failed]' };
    }
    throw error; // Re-throw other errors
  }
}
```

### Add Retry Logic

```javascript
// Example: Retry with exponential backoff
async function apiCallWithRetry(apiCall, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await apiCall();
    } catch (error) {
      if (attempt === maxRetries) throw error;
      
      const backoffMs = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
      console.log(`API call failed (attempt ${attempt}), retrying in ${backoffMs}ms...`);
      await new Promise(resolve => setTimeout(resolve, backoffMs));
    }
  }
}
```

### Health Check Endpoints

```javascript
// Example: Add health check endpoint
app.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {}
  };
  
  try {
    await axios.get('https://api.openai.com/v1/models', { timeout: 5000 });
    health.services.openai = 'up';
  } catch (error) {
    health.services.openai = 'down';
    health.status = 'degraded';
  }
  
  // Check other services...
  
  res.json(health);
});
```

## Troubleshooting Checklist

When encountering network issues:

- [ ] Run `./scripts/network-probe.sh` 
- [ ] Check DNS resolution with `nslookup`
- [ ] Test basic connectivity with `curl -I`
- [ ] Check for proxy environment variables
- [ ] Review firewall and security group settings
- [ ] Verify API keys are set correctly
- [ ] Check external service status pages
- [ ] Generate diagnostic report with `./scripts/network-diagnostics.sh`

## Getting Help

1. **Generate diagnostic report**:
   ```bash
   ./scripts/network-diagnostics.sh > network-report.txt
   ```

2. **Create GitHub issue** with:
   - Complete diagnostic report
   - Specific error messages
   - Environment details (OS, network type)
   - Steps to reproduce

3. **Include relevant logs**:
   - Application error logs
   - CI/CD pipeline logs
   - Network monitoring tools output

## Files Created/Modified

- `scripts/network-probe.sh` - Automated connectivity testing
- `scripts/network-diagnostics.sh` - Detailed network diagnostics  
- `scripts/reproduce-blocked-endpoints.sh` - Developer testing tool
- `docs/network-troubleshooting.md` - User troubleshooting guide
- `.github/workflows/ci.yml` - Added network probe step
- `pr_body.md` - PR template with firewall troubleshooting
- `CHANGELOG.md` - Project changelog