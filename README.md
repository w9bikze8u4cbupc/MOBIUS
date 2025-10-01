# MOBIUS

A pipeline for generating game tutorial videos from structured game rules.

## Quick Start

### Windows (WSL2 - Recommended)

One-command setup for Windows developers using WSL2:

```powershell
# From PowerShell (in repository root)
.\scripts\run_mobius_from_ps.ps1 -RepoPath (pwd).Path
```

Or from WSL terminal:

```bash
curl -fsSL https://raw.githubusercontent.com/w9bikze8u4cbupc/MOBIUS/main/scripts/run_mobius_wsl.sh -o ~/run_mobius_wsl.sh
chmod +x ~/run_mobius_wsl.sh
~/run_mobius_wsl.sh
```

See [Windows Setup Guide](docs/WINDOWS_SETUP.md) for detailed instructions and troubleshooting.

### Linux / macOS

```bash
# Install Node.js 20.18.1
nvm install 20.18.1
nvm use 20.18.1

# Install dependencies
npm ci

# Verify setup
npm run verify-clean-genesis -- --verbose
```

## Prerequisites

- Node.js 20.18.1
- FFmpeg and FFprobe
- Docker Desktop (for staging environment and CI)

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for:
- Development workflow
- Testing guidelines
- Pull request process
- Code style guidelines

### Running Tests

```bash
# Unit tests
npm test

# Golden tests
npm run golden:check

# Verification
npm run verify-clean-genesis -- --verbose
```

### Staging Environment

```bash
# Build and start staging environment
docker build -f Dockerfile.ci -t mobius-api-ci:local .
docker compose -f docker-compose.staging.yml up -d --build

# Run smoke tests
./scripts/ci/smoke-tests.sh http://localhost:5001 30 2

# View logs
docker compose -f docker-compose.staging.yml logs

# Cleanup
docker compose -f docker-compose.staging.yml down --volumes --remove-orphans
```

## Documentation

- [Windows Setup Guide](docs/WINDOWS_SETUP.md) - Complete WSL2 setup for Windows
- [Windows Setup Checklist](docs/WINDOWS_SETUP_CHECKLIST.md) - Track your setup progress
- [Contributing Guide](CONTRIBUTING.md) - Development workflow and guidelines

## License

MIT
