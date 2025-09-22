# Network Diagnostics and Troubleshooting

This section has been added to the README to provide guidance on network connectivity issues that may occur during development or CI/CD execution.

## Network Dependencies

This project relies on several external APIs:
- **OpenAI API** (`api.openai.com`) - AI content generation
- **ElevenLabs API** (`api.elevenlabs.io`) - Text-to-speech conversion
- **BoardGameGeek API** (`boardgamegeek.com`) - Game metadata and images

## Network Connectivity Testing

### Automated Probe

Run the network connectivity probe to test all external dependencies:

```bash
./scripts/network-probe.sh [output_directory]
```

This generates diagnostic reports:
- `network-probe.log` - Raw test output
- `network-diagnostics.json` - Structured results in JSON format

### Manual Testing

Test individual services manually:

```bash
# Test DNS resolution
dig +short api.openai.com

# Test HTTP connectivity  
curl -v --max-time 10 https://api.openai.com/v1/models

# Test with mock APIs (development)
MOCK_APIS=true npm run dev
```

## Troubleshooting Network Issues

### Common Issues

1. **DNS Resolution Failures**
   - Symptoms: `Could not resolve host` errors
   - Solutions: Check DNS settings, try alternative DNS servers
   - Debug: `dig +short api.openai.com`

2. **Firewall/Proxy Blocking**
   - Symptoms: Connection timeouts, refused connections
   - Solutions: Configure firewall rules, check corporate proxy settings
   - Debug: `nc -vz api.openai.com 443`

3. **API Authentication/Rate Limiting**
   - Symptoms: HTTP 401, 403, or 429 errors
   - Solutions: Verify API keys, check usage quotas
   - Debug: Check API key environment variables

### CI/CD Issues

If network tests fail in CI:

1. **Check build artifacts**: Download `network-diagnostics` artifacts from failed builds
2. **Review logs**: Look for specific error patterns in the probe logs
3. **Environment differences**: GitHub runners may have different network access than local development

### Environment Variables for Resilience

```bash
# Enable mock APIs for development/testing
MOCK_APIS=true

# Adjust timeouts and retries
API_TIMEOUT=30000
API_RETRIES=3
```

## Network Resilience Features

The application includes built-in resilience mechanisms:

- **Automatic retries** with exponential backoff
- **Circuit breakers** to prevent cascading failures  
- **Fallback to mock services** for development
- **Structured error logging** for better diagnostics
- **Health check endpoints** for monitoring

For detailed troubleshooting guidance, see [docs/network-troubleshooting.md](docs/network-troubleshooting.md).

---

*This network diagnostics section helps developers and operators quickly identify and resolve connectivity issues that may affect the tutorial generation pipeline.*