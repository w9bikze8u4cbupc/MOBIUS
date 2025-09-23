# Mobius Games Tutorial Generator

A pipeline for generating game tutorial videos from structured game rules.

## Features

- Automated tutorial video generation from board game rules
- Multi-language support
- External API integrations for enhanced content
- Network connectivity monitoring and diagnostics

## External Dependencies

This application integrates with several external APIs:

- **OpenAI API** - AI-powered text processing and component identification
- **ElevenLabs API** - Text-to-speech conversion for narration
- **BoardGameGeek API** - Board game metadata and community data
- **Extract.pics API** - Image extraction from web content

## Network Monitoring

The repository includes automated network connectivity monitoring to detect firewall/egress issues that may affect external API access.

### Quick Network Diagnostics

```bash
# Run network connectivity probe
npm run network:probe

# Run comprehensive network probe validation
npm run network:test

# Manual probe with custom output directory
bash scripts/network-probe.sh custom-artifacts-dir
```

### Mock Mode for Development

When external APIs are unavailable, enable mock mode:

```bash
export MOCK_OPENAI=true
export MOCK_ELEVENLABS=true
export MOCK_BGG=true
export MOCK_EXTRACT_PICS=true
```

### CI Integration

Network connectivity is automatically tested in CI workflows. Diagnostic artifacts are uploaded on all runs for troubleshooting:

- `network-probe.log` - Human-readable diagnostics
- `network-diagnostics.json` - Structured data for automation
- `traceroute.log`, `dig.log`, `openssl.log` - Network path and protocol details

## Troubleshooting

For network connectivity issues, see the comprehensive [Network Troubleshooting Guide](docs/network-troubleshooting.md).

Common commands for diagnosing connectivity issues:

```bash
# Test DNS resolution
dig +short api.openai.com

# Test TCP connectivity
nc -vz api.openai.com 443

# Test HTTPS connectivity
curl -v --max-time 10 https://api.openai.com/v1/models

# Test TLS handshake
openssl s_client -connect api.openai.com:443 -servername api.openai.com
```

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Network diagnostics
npm run network:probe
```

## Support

- Network/Infrastructure Issues: Tag @infra-team in GitHub issues
- For emergency blocking: Use mock mode environment variables