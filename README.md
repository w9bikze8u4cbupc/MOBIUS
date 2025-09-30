# MOBIUS Games Tutorial Generator

A pipeline for generating game tutorial videos from structured game rules with comprehensive CI testing infrastructure.

## Features

- **Video Generation**: Create game tutorial videos from rulebook content
- **Golden Testing**: Automated video quality validation and regression testing  
- **CI Infrastructure**: Containerized mock API for testing without external dependencies
- **Repository Verification**: Automated cleanliness checks for unwanted references

## Quick Start

### Development Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Run Tests**
   ```bash
   npm test
   ```

3. **Golden Testing**
   ```bash
   # Check golden standards
   npm run golden:check
   
   # Update golden standards  
   npm run golden:approve
   ```

### CI Testing Infrastructure

This project includes a comprehensive CI testing infrastructure that validates container builds and API behavior without external dependencies.

#### Local Testing

1. **Build CI Container**
   ```bash
   npm run ci:build
   # or directly: docker build -f Dockerfile.ci -t mobius-api-ci:local .
   ```

2. **Start Staging Environment**
   ```bash
   npm run ci:up
   # or directly: docker compose -f docker-compose.staging.yml up -d
   ```

3. **Run Smoke Tests**
   ```bash
   npm run ci:smoke-tests
   # or directly: ./scripts/ci/smoke-tests.sh http://localhost:5001 30 2
   ```

4. **Complete CI Test Suite**
   ```bash
   npm run ci:test
   # Builds, starts, tests, and cleans up automatically
   ```

5. **Cleanup**
   ```bash
   npm run ci:down
   # or directly: docker compose -f docker-compose.staging.yml down --volumes --remove-orphans
   ```

#### Repository Verification

Check for unwanted references in the codebase:

```bash
npm run verify-clean-genesis
# or directly: node scripts/verify-clean-genesis.js
```

This generates a verification report in `verification-reports/` with detailed findings.

#### Available Endpoints (Mock API)

The CI mock API provides the following endpoints for testing:

- `GET /health` - Health check
- `POST /process-pdf` - PDF processing simulation
- `POST /analyze-text` - Text analysis simulation  
- `POST /process-images` - Image processing simulation
- `POST /generate-tts` - TTS generation simulation
- `POST /save-project` - Project save simulation
- `GET /projects` - Project listing simulation

## Contributing

1. Fork the repository
2. Create a feature branch
3. Run the full test suite: `npm run ci:test`
4. Ensure verification passes: `npm run verify-clean-genesis`
5. Submit a pull request with detailed description

The CI pipeline will automatically run golden tests, smoke tests, and verification checks on all pull requests.
