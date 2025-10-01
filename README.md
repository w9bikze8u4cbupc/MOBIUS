# MOBIUS

A pipeline for generating game tutorial videos from structured game rules.

## Quick Start

### Windows (WSL2 Recommended)

One-command setup for Windows developers:

```powershell
# From PowerShell
wsl curl -fsSL https://raw.githubusercontent.com/w9bikze8u4cbupc/MOBIUS/main/scripts/run_mobius_wsl.sh -o ~/run_mobius_wsl.sh
wsl chmod +x ~/run_mobius_wsl.sh
wsl bash -lc "bash ~/run_mobius_wsl.sh"
```

Or use the PowerShell wrapper from the repository:

```powershell
.\scripts\run_mobius_from_ps.ps1 -RepoPath (pwd).Path
```

See [Windows Setup Guide](./docs/WINDOWS_SETUP.md) for detailed instructions and troubleshooting.

### macOS/Linux

```bash
# Prerequisites: Node.js 20.18.1, ffmpeg, Docker

# Clone and setup
git clone https://github.com/w9bikze8u4cbupc/MOBIUS.git
cd MOBIUS
npm ci

# Verify setup
npm run verify-clean-genesis -- --verbose

# Run tests
npm test
```

## Features

- Generate game tutorial videos from structured rules
- Component extraction and matching
- Golden reference testing for video output verification
- Docker-based CI/staging environment

## Documentation

- [Windows Setup Guide](./docs/WINDOWS_SETUP.md) - Complete WSL2 setup for Windows
- [Windows Setup Checklist](./docs/WINDOWS_SETUP_CHECKLIST.md) - Step-by-step tracker
- [Contributing Guide](./CONTRIBUTING.md) - Development workflow and guidelines

## Development

### Prerequisites

- Node.js 20.18.1 or later
- npm 10.x or later
- Docker Desktop
- ffmpeg

### Installation

```bash
npm ci
```

### Available Scripts

```bash
# Run tests
npm test

# Verify repository integrity
npm run verify-clean-genesis

# Generate golden references
npm run golden:update

# Check against golden references
npm run golden:check
```

### Docker Staging Environment

```bash
# Build CI image
docker build -f Dockerfile.ci -t mobius-api-ci:local .

# Start staging environment
docker compose -f docker-compose.staging.yml up -d --build

# Run smoke tests
./scripts/ci/smoke-tests.sh http://localhost:5001 30 2

# View logs
docker compose -f docker-compose.staging.yml logs

# Tear down
docker compose -f docker-compose.staging.yml down --volumes --remove-orphans
```

## Project Structure

```
MOBIUS/
├── client/           # Frontend application
├── src/             # Source code
│   └── api/         # API endpoints
├── scripts/         # Build and automation scripts
│   └── ci/          # CI-specific scripts
├── tests/           # Test files and golden references
├── docs/            # Documentation
└── package.json     # Project dependencies
```

## Testing

### Unit Tests

```bash
npm test
```

### Golden Tests

Golden tests verify video output against reference files:

```bash
# Generate golden references
npm run golden:update:sushi
npm run golden:update:loveletter

# Check current output against references
npm run golden:check:sushi
npm run golden:check:loveletter
npm run golden:check
```

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for:

- Development setup
- Workflow guidelines
- Testing requirements
- Pull request process
- Code style guidelines

## License

MIT
