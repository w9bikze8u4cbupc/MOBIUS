# Pull Request: Network Troubleshooting Documentation & CI Improvements

## Overview
This PR adds comprehensive network troubleshooting documentation and CI improvements to help diagnose and resolve connectivity issues with external APIs in staging and production environments.

## Changes Made
- ✅ Added network probe step to CI workflow
- ✅ Created network troubleshooting checklist
- ✅ Added developer reproduction scripts for blocked endpoints
- ✅ Updated documentation with firewall troubleshooting guidance

## External Dependencies
This application requires network access to the following endpoints:
- **OpenAI API**: `https://api.openai.com` (port 443)
- **ElevenLabs API**: `https://api.elevenlabs.io` (port 443)
- **LibreTranslate**: `http://localhost:5002` (local service)

## Firewall Troubleshooting

### If you're experiencing network connectivity issues:

1. **Check endpoint accessibility** using the provided scripts in `scripts/network-probe.sh`
2. **Verify DNS resolution** for external APIs
3. **Test from the same network/environment** where the application runs
4. **Check corporate firewall** rules for the required domains

### Common Issues & Solutions

| Issue | Symptoms | Solution |
|-------|----------|----------|
| Blocked OpenAI API | `ECONNREFUSED` or timeout errors during text generation | Add `api.openai.com:443` to firewall allowlist |
| Blocked ElevenLabs API | TTS generation fails with network errors | Add `api.elevenlabs.io:443` to firewall allowlist |
| LibreTranslate unavailable | Translation fails with connection refused | Ensure LibreTranslate service is running on port 5002 |
| DNS resolution failure | `ENOTFOUND` errors | Configure DNS to resolve external domains |

### Network Requirements
- **Outbound HTTPS (443)**: For OpenAI and ElevenLabs APIs
- **Local HTTP (5002)**: For LibreTranslate service
- **DNS resolution**: Must resolve `api.openai.com` and `api.elevenlabs.io`

## Testing

### To test network connectivity:
```bash
# Run network probe script
./scripts/network-probe.sh

# Test individual endpoints
curl -I https://api.openai.com/v1/models
curl -I https://api.elevenlabs.io/v1/voices
curl -I http://localhost:5002/translate
```

### Failed Connections - Please Attach:
**If experiencing network issues, please provide the following information:**

**Blocked Hostnames/IPs:** 
```
[PASTE FAILING HOSTNAMES/IPS HERE]
Example:
- api.openai.com (resolved to 104.18.7.192)
- api.elevenlabs.io (resolved to 172.67.74.226)
```

**Error Logs:**
```
[PASTE ERROR LOGS HERE]
Example:
Error: connect ETIMEDOUT 104.18.7.192:443
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1555:16)
```

**Network Diagnostics:**
```
[PASTE CURL/TRACEROUTE/DIG OUTPUT HERE]
Run: ./scripts/network-diagnostics.sh and paste output
```

## Breaking Changes
None - this is purely additive documentation and tooling.

## Checklist
- [x] Added network probe step to CI
- [x] Created troubleshooting documentation
- [x] Added developer reproduction scripts
- [x] Updated firewall guidance
- [x] Tested network probe functionality