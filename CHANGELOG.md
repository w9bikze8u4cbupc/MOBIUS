# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

#### Documentation
- **WINDOWS_SETUP.md**: Comprehensive Windows setup guide with WSL2 + Docker Desktop instructions
  - Step-by-step WSL2 installation and configuration
  - Docker Desktop setup and integration
  - Windows-native PowerShell alternative
  - Extensive troubleshooting section
  - Performance optimization tips
  - Quick reference commands
- **QUICKSTART.md**: Condensed setup guide for rapid deployment across all platforms
- **CONTRIBUTING.md**: Contribution guidelines with development workflow
- **README.md**: Comprehensive project overview with quick links to all guides
- **.env.example**: Environment variable template with detailed comments

#### Docker Infrastructure
- **Dockerfile.ci**: Production-ready Docker image for API backend
  - Node.js 20 slim base image
  - FFmpeg and Python3 support
  - Non-root user (UID 1001) for security
  - Health check integration
- **client/Dockerfile**: Production-ready Docker image for React frontend
  - Optimized build process
  - Serves static build with `serve`
  - Non-root user for security
- **docker-compose.staging.yml**: Complete orchestration for local development
  - API and client services
  - Health check dependencies
  - Volume management
  - Network isolation
- **.dockerignore**: Optimized Docker build context exclusions

#### Scripts and Automation
- **scripts/ci/smoke-tests.sh**: Bash-based API smoke testing
  - Service health check with timeout and retries
  - API endpoint validation
  - CORS header verification
  - Colored output and detailed logging
  - JUnit-compatible reporting
- **scripts/verify-clean-genesis.js**: Environment verification tool
  - Node.js version compatibility check
  - Dependency installation validation
  - FFmpeg availability check
  - Project structure verification
  - Directory creation for missing paths
  - Color-coded pass/fail/warning output
  - Verbose mode support

#### API Enhancements
- **Health check endpoint** (`/health`): Returns service status, timestamp, and version
  - Used by Docker health checks
  - Compatible with smoke tests
  - Returns JSON response with service metadata

#### NPM Scripts
- `start`: Launch backend API server
- `dev`: Alias for start (development mode)
- `verify-clean-genesis`: Run environment verification checks

#### Configuration
- Updated `.gitignore` to allow `.env.example` while excluding actual `.env` files
- Environment variable documentation in `.env.example`

### Changed
- Enhanced `package.json` with new npm scripts
- Updated README.md with comprehensive documentation structure
- Cross-linked all documentation files for easy navigation

### Security
- Docker containers run as non-root user (UID 1001)
- `.env.example` template prevents accidental secret commits
- Updated `.gitignore` for better secret management

## [1.0.0] - 2024-XX-XX

### Initial Release
- Basic project structure
- Express backend API for BoardGameGeek metadata extraction
- React frontend for game tutorial creation
- AI-powered rulebook analysis with OpenAI
- Golden video verification system
- Multi-platform CI/CD with GitHub Actions (Ubuntu, macOS, Windows)
- FFmpeg-based video rendering
- EBU R128 audio compliance checks

---

## Documentation Structure

The project now includes the following documentation files:

1. **README.md** - Main project documentation
2. **WINDOWS_SETUP.md** - Detailed Windows setup guide (15KB)
3. **QUICKSTART.md** - Fast setup guide for all platforms (3.6KB)
4. **CONTRIBUTING.md** - Contribution guidelines (7.2KB)
5. **.env.example** - Environment configuration template
6. **CHANGELOG.md** - This file

All documentation is cross-linked for easy navigation.

[Unreleased]: https://github.com/w9bikze8u4cbupc/MOBIUS/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/w9bikze8u4cbupc/MOBIUS/releases/tag/v1.0.0
