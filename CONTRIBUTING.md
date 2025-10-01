# Contributing to MOBIUS

Thank you for your interest in contributing to MOBIUS! This document provides guidelines and instructions for contributing to the project.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Environment](#development-environment)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Submitting Changes](#submitting-changes)

## Getting Started

### Prerequisites

- **Windows Users**: WSL2, Docker Desktop, Node.js 20.18.1, ffmpeg
  - See [docs/WINDOWS_SETUP.md](docs/WINDOWS_SETUP.md) for complete setup
- **macOS/Linux Users**: Node.js 20.18.1, ffmpeg, Docker (optional)

### Initial Setup

1. **Fork and Clone**
   ```bash
   git clone https://github.com/YOUR_USERNAME/MOBIUS.git
   cd MOBIUS
   ```

2. **Install Dependencies**
   ```bash
   npm ci
   ```

3. **Verify Setup**
   ```bash
   npm run verify-clean-genesis
   npm test
   ```

## Development Environment

### Recommended Tools

- **VS Code** with extensions:
  - ESLint
  - Prettier
  - Docker
  - Remote - WSL (for Windows users)

### Directory Structure

```
MOBIUS/
├── docs/                   # Documentation
├── scripts/                # Build and utility scripts
│   ├── ci/                # CI/CD scripts
│   ├── check_golden.js    # Golden file verification
│   └── generate_golden.js # Golden file generation
├── src/                    # Source code
│   ├── api/               # API server
│   └── ...                # Other source files
├── tests/                  # Test files
│   └── golden/            # Golden reference files
├── client/                 # Frontend client
├── Dockerfile.ci           # CI Docker image
├── docker-compose.staging.yml  # Staging environment
└── package.json           # Node.js dependencies and scripts
```

## Development Workflow

### 1. Create a Feature Branch

```bash
git checkout -b feat/your-feature-name
```

Use branch name prefixes:
- `feat/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation updates
- `refactor/` - Code refactoring
- `test/` - Test additions or updates

### 2. Make Your Changes

- Follow the [Coding Standards](#coding-standards)
- Write or update tests as needed
- Update documentation if adding new features

### 3. Test Your Changes

```bash
# Run unit tests
npm test

# Run verification
npm run verify-clean-genesis

# Run golden tests (if applicable)
npm run golden:check

# Test with Docker (optional but recommended)
docker build -f Dockerfile.ci -t mobius-api-ci:local .
docker compose -f docker-compose.staging.yml up -d --build
./scripts/ci/smoke-tests.sh http://localhost:5001 30 2
docker compose -f docker-compose.staging.yml down --volumes --remove-orphans
```

### 4. Commit Your Changes

Use conventional commit messages:

```bash
git add .
git commit -m "feat: add new video processing feature"
```

Commit message format:
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation change
- `test:` - Test updates
- `refactor:` - Code refactoring
- `chore:` - Maintenance tasks

### 5. Push and Create Pull Request

```bash
git push origin feat/your-feature-name
```

Then create a Pull Request on GitHub with:
- Clear description of changes
- Link to related issues
- Screenshots (if UI changes)
- Test results

## Coding Standards

### JavaScript/Node.js

- Use ES6+ syntax
- Use meaningful variable and function names
- Add JSDoc comments for public APIs
- Follow existing code style

### Scripts

- Bash scripts should include:
  - Shebang (`#!/usr/bin/env bash`)
  - Error handling (`set -e`)
  - Colored output for user feedback
  - Proper argument validation

### Docker

- Use Alpine Linux for smaller images
- Run containers as non-root user (UID 1001)
- Include health checks
- Document exposed ports and volumes

## Testing

### Unit Tests

Run Jest tests:
```bash
npm test
```

### Integration Tests

Test with Docker environment:
```bash
docker compose -f docker-compose.staging.yml up -d --build
./scripts/ci/smoke-tests.sh http://localhost:5001 30 2
docker compose -f docker-compose.staging.yml down --volumes --remove-orphans
```

### Golden File Testing

When modifying video processing:

1. **Generate new golden files**:
   ```bash
   npm run golden:update:sushi
   npm run golden:update:loveletter
   ```

2. **Verify against golden files**:
   ```bash
   npm run golden:check
   ```

3. **Include golden file updates in your PR** if intentional changes to output

## Submitting Changes

### Pull Request Checklist

Before submitting a PR, ensure:

- [ ] Code follows project coding standards
- [ ] All tests pass (`npm test`)
- [ ] Documentation is updated
- [ ] Commit messages follow conventional format
- [ ] PR description clearly explains changes
- [ ] No merge conflicts with main branch
- [ ] Docker build succeeds (if applicable)
- [ ] Smoke tests pass (if applicable)

### PR Review Process

1. **Automated Checks**: CI will run tests and builds
2. **Code Review**: Maintainers will review your code
3. **Feedback**: Address any requested changes
4. **Approval**: Once approved, your PR will be merged

### After Your PR is Merged

- Delete your feature branch
- Pull the latest main branch
- Celebrate! 🎉

## Common Tasks

### Adding a New Script

1. Create script in `scripts/` directory
2. Make it executable: `chmod +x scripts/your-script.sh`
3. Add to `package.json` scripts section if needed
4. Document usage in script header comments
5. Test thoroughly before committing

### Updating Documentation

1. Edit files in `docs/` directory
2. Use clear, concise language
3. Include code examples where helpful
4. Update cross-references if needed
5. Preview with a Markdown viewer

### Working with Docker

**Build CI image:**
```bash
docker build -f Dockerfile.ci -t mobius-api-ci:local .
```

**Start staging environment:**
```bash
docker compose -f docker-compose.staging.yml up -d --build
```

**View logs:**
```bash
docker compose -f docker-compose.staging.yml logs -f
```

**Stop environment:**
```bash
docker compose -f docker-compose.staging.yml down --volumes --remove-orphans
```

## Getting Help

- **Documentation**: Check [docs/](docs/) directory
- **Issues**: Search existing [GitHub issues](https://github.com/w9bikze8u4cbupc/MOBIUS/issues)
- **New Issue**: Create an issue with detailed information
- **Discussions**: Use GitHub Discussions for questions

## Windows-Specific Guidelines

### Using WSL2

- Always work inside WSL2 for consistency
- Access files via `\\wsl$\Ubuntu\home\username\MOBIUS` from Windows
- Use VS Code Remote - WSL extension for best experience

### Docker on Windows

- Ensure Docker Desktop is running
- Enable WSL integration in Docker settings
- Verify with `docker ps` in WSL

### Troubleshooting

See [docs/WINDOWS_SETUP.md#troubleshooting](docs/WINDOWS_SETUP.md#troubleshooting) for common issues and solutions.

## Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- Focus on the code, not the person
- Help others learn and grow

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to MOBIUS! Your efforts help make this project better for everyone.
