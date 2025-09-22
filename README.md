# Mobius Games Tutorial Generator

A pipeline for generating game tutorial videos from structured game rules using AI-powered content generation.

## Features

- **Rule Analysis**: Automatically extracts and analyzes game rulebooks
- **Component Identification**: AI-powered identification of game components
- **Tutorial Generation**: Creates structured tutorial content with narration
- **Multi-language Support**: Text-to-speech in multiple languages
- **Video Production**: Automated video timeline and rendering pipeline

## Dependencies

This application requires network access to external APIs:
- **OpenAI API** (`api.openai.com`) - For text generation and content analysis  
- **ElevenLabs API** (`api.elevenlabs.io`) - For text-to-speech generation
- **LibreTranslate** (`localhost:5002`) - For translation services (optional)

## Quick Start

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Test network connectivity**:
   ```bash
   ./scripts/network-probe.sh
   ```

3. **Set up environment variables**:
   ```bash
   export OPENAI_API_KEY=your_openai_key
   export ELEVENLABS_API_KEY=your_elevenlabs_key
   ```

4. **Run the application**:
   ```bash
   npm start
   ```

## Network Troubleshooting

If you're experiencing connectivity issues:

- 🔍 **Quick diagnosis**: Run `./scripts/network-probe.sh`
- 📋 **Full troubleshooting guide**: See [docs/network-troubleshooting.md](docs/network-troubleshooting.md)
- 👨‍💻 **Developer testing**: See [docs/developer-network-guide.md](docs/developer-network-guide.md)
- 🚨 **Generate diagnostic report**: Run `./scripts/network-diagnostics.sh`

### Common Issues
- **Corporate firewalls**: API domains may be blocked
- **CI/CD environments**: Outbound internet access may be restricted
- **DNS resolution**: External domains may not be resolvable

## Development

### Testing Network Issues

```bash
# Block external APIs for testing
./scripts/reproduce-blocked-endpoints.sh --block-all

# Test your changes
npm start

# Restore connectivity  
./scripts/reproduce-blocked-endpoints.sh --restore
```

### Scripts

- `scripts/network-probe.sh` - Test API connectivity
- `scripts/network-diagnostics.sh` - Generate detailed network report
- `scripts/reproduce-blocked-endpoints.sh` - Simulate network failures for testing

## Project Structure

```
├── src/api/               # Backend API server
├── client/               # Frontend React application  
├── scripts/              # Build and utility scripts
├── docs/                 # Documentation
├── tests/                # Test files
└── .github/workflows/    # CI/CD pipelines
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Test network connectivity with `./scripts/network-probe.sh`
4. Make your changes
5. Run tests: `npm test`
6. Submit a pull request

## Support

For network connectivity issues:
1. Run `./scripts/network-diagnostics.sh > report.txt`
2. Create a GitHub issue and attach the diagnostic report
3. Include your environment details and specific error messages

## License

MIT License - see LICENSE file for details.