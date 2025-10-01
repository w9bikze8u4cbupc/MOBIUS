# MOBIUS

A pipeline for generating game tutorial videos from structured game rules.

## Quick Start

### Windows (WSL2 Recommended)

**One-command bootstrap:**

```bash
curl -fsSL https://raw.githubusercontent.com/w9bikze8u4cbupc/MOBIUS/main/scripts/run_mobius_wsl.sh -o ~/run_mobius_wsl.sh
chmod +x ~/run_mobius_wsl.sh
~/run_mobius_wsl.sh
```

Or from PowerShell:

```powershell
.\scripts\run_mobius_from_ps.ps1 -RepoPath (pwd).Path
```

See [docs/WINDOWS_SETUP.md](docs/WINDOWS_SETUP.md) for detailed Windows setup instructions.

### Linux/macOS

```bash
# Install Node.js 20.18.1
nvm install 20.18.1
nvm use 20.18.1

# Clone and setup
git clone https://github.com/w9bikze8u4cbupc/MOBIUS.git
cd MOBIUS
npm ci

# Verify setup
npm run verify-clean-genesis -- --verbose

# Build and start
docker build -f Dockerfile.ci -t mobius-api-ci:local .
docker compose -f docker-compose.staging.yml up -d --build
./scripts/ci/smoke-tests.sh http://localhost:5001 30 2
```

## Documentation

- [Windows Setup Guide](docs/WINDOWS_SETUP.md) - Complete WSL2 setup with troubleshooting
- [Windows Setup Checklist](docs/WINDOWS_SETUP_CHECKLIST.md) - Track your setup progress
- [Contributing Guide](CONTRIBUTING.md) - Development workflow and guidelines

## Features

- Automated game tutorial video generation
- Golden reference testing for video output quality
- Docker-based development environment
- CI-ready infrastructure with smoke tests
- Cross-platform support (Windows WSL2, Linux, macOS)

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed development workflow, testing guidelines, and code style conventions.

## Testing

```bash
# Run tests
npm test

# Run repository verification
npm run verify-clean-genesis -- --verbose

# Run golden tests
npm run golden:check

# Run smoke tests (requires running application)
./scripts/ci/smoke-tests.sh http://localhost:5001 30 2
```

## License

MIT
