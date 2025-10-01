# Contributing to MOBIUS

Thank you for your interest in contributing to MOBIUS! This document provides guidelines and best practices for contributing to the project.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Testing Guidelines](#testing-guidelines)
- [Pull Request Process](#pull-request-process)
- [Code Style Conventions](#code-style-conventions)
- [Commit Message Guidelines](#commit-message-guidelines)

## Getting Started

### Prerequisites

- Node.js 20.18.1 (via nvm)
- ffmpeg 4.x or later
- Docker and Docker Compose
- Git

### Setup

For Windows users, see [docs/WINDOWS_SETUP.md](docs/WINDOWS_SETUP.md) for detailed setup instructions.

For Linux/macOS:

```bash
# Clone the repository
git clone https://github.com/w9bikze8u4cbupc/MOBIUS.git
cd MOBIUS

# Install Node.js 20.18.1 via nvm
nvm install 20.18.1
nvm use 20.18.1

# Install dependencies
npm ci

# Verify setup
npm run verify-clean-genesis -- --verbose
```

## Development Workflow

### 1. Create a Feature Branch

```bash
git checkout -b feat/your-feature-name
```

Branch naming conventions:
- `feat/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation changes
- `refactor/` - Code refactoring
- `test/` - Test additions or fixes
- `chore/` - Maintenance tasks

### 2. Make Your Changes

- Keep changes focused and atomic
- Write clear, self-documenting code
- Add comments only when necessary to explain complex logic
- Update documentation if your changes affect user-facing behavior

### 3. Run Repository Verification

Before committing, ensure repository integrity:

```bash
npm run verify-clean-genesis -- --verbose
```

This script checks for:
- Repository structure consistency
- File integrity
- Configuration validity

### 4. Test Your Changes

```bash
# Run existing tests
npm test

# Build and test with Docker
docker build -f Dockerfile.ci -t mobius-api-ci:test .
docker compose -f docker-compose.staging.yml up -d --build

# Run smoke tests
./scripts/ci/smoke-tests.sh http://localhost:5001 30 2

# Cleanup
docker compose -f docker-compose.staging.yml down --volumes --remove-orphans
```

### 5. Commit Your Changes

```bash
git add .
git commit -m "feat: add new feature description"
```

See [Commit Message Guidelines](#commit-message-guidelines) for commit message format.

### 6. Push and Create Pull Request

```bash
git push origin feat/your-feature-name
```

Then create a pull request on GitHub following the [Pull Request Process](#pull-request-process).

## Testing Guidelines

### Unit Tests

Currently using Jest for testing. Tests should be placed in `__tests__` directories or named with `.test.ts` or `.spec.ts` suffix.

```bash
npm test
```

### Integration Tests

Golden reference tests compare video output against baseline:

```bash
# Check against golden baselines
npm run golden:check

# Update golden baselines (when output intentionally changes)
npm run golden:approve
```

### Smoke Tests

Smoke tests verify basic functionality of the API:

```bash
# Start the application
docker compose -f docker-compose.staging.yml up -d

# Run smoke tests
./scripts/ci/smoke-tests.sh http://localhost:5001 30 2

# Check logs if tests fail
cat smoke-tests.log
docker compose -f docker-compose.staging.yml logs > compose-logs.log
```

### Docker Testing

Test Docker builds and container behavior:

```bash
# Build CI image
docker build -f Dockerfile.ci -t mobius-api-ci:test .

# Start staging environment
docker compose -f docker-compose.staging.yml up -d --build

# Verify containers are healthy
docker compose -f docker-compose.staging.yml ps
docker compose -f docker-compose.staging.yml logs
```

## Pull Request Process

### Before Opening a PR

1. ✅ Run `npm run verify-clean-genesis -- --verbose`
2. ✅ Run `npm test` (all tests passing)
3. ✅ Build Docker images successfully
4. ✅ Run smoke tests successfully
5. ✅ Update documentation if needed
6. ✅ Rebase on latest main branch

### PR Title

Use conventional commit format:
- `feat: add new feature`
- `fix: resolve issue with X`
- `docs: update Windows setup guide`
- `refactor: simplify video generation logic`
- `test: add tests for component X`
- `chore: update dependencies`

### PR Description

Include:

```markdown
## Summary
Brief description of what this PR does

## Changes
- Bullet list of changes made
- Include any breaking changes

## Testing
How to test these changes

## Checklist
- [ ] Tests pass locally
- [ ] Documentation updated
- [ ] Repository verification passes
- [ ] Docker builds successfully
- [ ] Smoke tests pass
```

### PR Review Process

1. Automated CI checks must pass
2. At least one maintainer review required
3. Address review feedback
4. Once approved, maintainer will merge

### After PR is Merged

- Delete your feature branch
- Pull latest main
- Start your next contribution!

## Code Style Conventions

### JavaScript/TypeScript

- Use ES6+ features
- Prefer `const` over `let`, avoid `var`
- Use arrow functions for callbacks
- Use template literals for string interpolation
- Use async/await over raw promises

Example:
```javascript
// Good
const processVideo = async (input) => {
  const result = await ffmpeg.process(input);
  return `Processed: ${result}`;
};

// Avoid
var processVideo = function(input) {
  return ffmpeg.process(input).then(function(result) {
    return 'Processed: ' + result;
  });
};
```

### File Organization

- Group related functions together
- Export functions at the end of the file
- Keep files focused and under 500 lines when possible

### Comments

- Write self-documenting code when possible
- Add comments for complex algorithms or business logic
- Use JSDoc for public API functions

```javascript
/**
 * Extracts frame from video at specified time
 * @param {string} input - Path to input video
 * @param {number} timeSec - Time in seconds
 * @param {string} tmpDir - Temporary directory for output
 * @param {boolean} accurate - Use accurate seeking
 * @returns {string} Path to extracted frame
 */
function extractTempFrame(input, timeSec, tmpDir, accurate = true) {
  // Implementation
}
```

### Error Handling

- Always handle errors appropriately
- Log errors with context
- Use try-catch for async operations
- Provide meaningful error messages

```javascript
// Good
try {
  const result = await processVideo(input);
  return result;
} catch (error) {
  console.error(`Failed to process video ${input}:`, error.message);
  throw new Error(`Video processing failed: ${error.message}`);
}
```

## Commit Message Guidelines

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Type

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, semicolons, etc.)
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `chore`: Maintenance tasks, dependency updates

### Scope (Optional)

The area of code being changed:
- `api`: API-related changes
- `video`: Video generation logic
- `golden`: Golden testing
- `docker`: Docker/container changes
- `ci`: CI/CD changes

### Subject

- Use imperative mood ("add" not "added" or "adds")
- Don't capitalize first letter
- No period at the end
- Maximum 72 characters

### Body (Optional)

- Explain what and why, not how
- Wrap at 72 characters

### Footer (Optional)

- Reference issues: `Fixes #123`, `Closes #456`
- Note breaking changes: `BREAKING CHANGE: description`

### Examples

```
feat(api): add endpoint for video status

Add new /api/video/:id/status endpoint to check processing status.
Returns JSON with current state and progress percentage.

Closes #123
```

```
fix(video): correct frame extraction timing

Frame extraction was using inaccurate seeking, causing incorrect
frames to be captured. Now uses accurate seeking by default.

Fixes #456
```

```
docs: add Windows WSL2 setup guide

Add comprehensive Windows setup documentation with troubleshooting
section and step-by-step checklist.
```

## Need Help?

- Check existing issues and pull requests
- Review [docs/WINDOWS_SETUP.md](docs/WINDOWS_SETUP.md) for setup help
- Create a new issue with:
  - Clear description of the problem
  - Steps to reproduce
  - Expected vs actual behavior
  - Environment details (OS, Node version, Docker version)
  - Relevant logs and error messages

## License

By contributing to MOBIUS, you agree that your contributions will be licensed under the MIT License.
