# Contributing to MOBIUS

Thank you for your interest in contributing to MOBIUS! This guide will help you understand our development workflow, testing practices, and PR process.

## Table of Contents

- [Development Setup](#development-setup)
- [Development Workflow](#development-workflow)
- [Testing Guidelines](#testing-guidelines)
- [Pull Request Process](#pull-request-process)
- [Code Style](#code-style)
- [Commit Guidelines](#commit-guidelines)

## Development Setup

### Prerequisites

- Node.js 20.18.1 (via nvm)
- FFmpeg and FFprobe
- Docker Desktop (with WSL2 integration for Windows users)
- Git

### Windows Users

See [Windows Setup Guide](docs/WINDOWS_SETUP.md) for complete WSL2 setup instructions.

### Quick Start

```bash
# Clone the repository
git clone https://github.com/w9bikze8u4cbupc/MOBIUS.git
cd MOBIUS

# Install dependencies
npm ci

# Verify setup
npm run verify-clean-genesis -- --verbose

# Run tests
npm test
```

## Development Workflow

### 1. Create a Feature Branch

Always work on a feature branch, never directly on `main`:

```bash
git checkout main
git pull origin main
git checkout -b feat/your-feature-name
```

Branch naming conventions:
- `feat/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation changes
- `refactor/` - Code refactoring
- `test/` - Test additions or modifications
- `chore/` - Maintenance tasks

### 2. Make Your Changes

- Keep changes focused and atomic
- Write clear, self-documenting code
- Add comments for complex logic
- Update documentation as needed

### 3. Test Your Changes

Run the full test suite before committing:

```bash
# Run unit tests
npm test

# Run golden tests (if you modified video generation)
npm run golden:check

# Run verification
npm run verify-clean-genesis -- --verbose

# Run smoke tests (if you modified the API)
./scripts/ci/smoke-tests.sh http://localhost:5001 30 2
```

### 4. Commit Your Changes

Use clear, descriptive commit messages following the [Conventional Commits](https://www.conventionalcommits.org/) format:

```bash
git add .
git commit -m "feat: add Windows WSL2 bootstrap script"
```

See [Commit Guidelines](#commit-guidelines) for more details.

### 5. Push and Create PR

```bash
# Push your branch
git push origin feat/your-feature-name

# Create PR via GitHub web interface or gh CLI
gh pr create --base main --title "Your PR Title" --body "PR description"
```

## Testing Guidelines

### Unit Tests

- Write tests for all new functionality
- Maintain or improve code coverage
- Use descriptive test names
- Follow existing test patterns

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run specific test file
npm test -- path/to/test.spec.ts
```

### Golden Tests

Golden tests verify video generation consistency across platforms:

```bash
# Check golden tests for all games
npm run golden:check

# Check specific game
npm run golden:check:sushi

# Update golden artifacts (after verifying changes are correct)
npm run golden:approve
```

If golden tests fail:
1. Review diff images in `tests/golden/*/debug/`
2. Verify the changes are intentional
3. If correct, update golden artifacts
4. If incorrect, fix the code

### Integration Tests

Test the full pipeline:

```bash
# Build Docker image
docker build -f Dockerfile.ci -t mobius-api-ci:local .

# Start staging environment
docker compose -f docker-compose.staging.yml up -d --build

# Run smoke tests
./scripts/ci/smoke-tests.sh http://localhost:5001 30 2

# Check logs
docker compose -f docker-compose.staging.yml logs

# Cleanup
docker compose -f docker-compose.staging.yml down --volumes --remove-orphans
```

### Smoke Tests

API smoke tests verify basic functionality:

```bash
# Run smoke tests against local instance
./scripts/ci/smoke-tests.sh http://localhost:5001 30 2

# Check smoke-tests.log for details if tests fail
cat smoke-tests.log
```

## Pull Request Process

### Before Creating a PR

1. **Rebase on latest main**:
   ```bash
   git checkout main
   git pull origin main
   git checkout feat/your-feature-name
   git rebase main
   ```

2. **Run all tests**:
   ```bash
   npm ci
   npm test
   npm run verify-clean-genesis -- --verbose
   ```

3. **Build and verify locally**:
   ```bash
   docker build -f Dockerfile.ci -t mobius-api-ci:local .
   docker compose -f docker-compose.staging.yml up -d --build
   ./scripts/ci/smoke-tests.sh http://localhost:5001 30 2
   docker compose -f docker-compose.staging.yml down --volumes --remove-orphans
   ```

### PR Requirements

A good PR should have:

1. **Clear title**: Following conventional commit format
   - `feat: add new feature`
   - `fix: resolve bug in component`
   - `docs: update setup guide`

2. **Detailed description**:
   - What changes were made
   - Why they were necessary
   - How to test them
   - Any breaking changes
   - Screenshots (for UI changes)

3. **Passing tests**: All CI checks must pass

4. **No merge conflicts**: Rebase if needed

5. **Reasonable size**: Keep PRs focused and reviewable
   - Prefer multiple small PRs over one large PR
   - Split unrelated changes into separate PRs

### PR Template

```markdown
## Summary
Brief description of what this PR does

## Changes
- Change 1
- Change 2
- Change 3

## Testing
How to test these changes:
1. Step 1
2. Step 2
3. Expected result

## Checklist
- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] No breaking changes (or documented)
- [ ] All tests passing locally
- [ ] Code follows style guidelines
```

### Review Process

1. **Automated checks**: CI runs tests automatically
2. **Code review**: Maintainers review your code
3. **Address feedback**: Make requested changes
4. **Approval**: PR is approved by maintainer
5. **Merge**: PR is merged to main

## Code Style

### JavaScript/TypeScript

- Use consistent indentation (2 spaces)
- Use meaningful variable names
- Prefer `const` over `let`, avoid `var`
- Use template literals for string interpolation
- Add JSDoc comments for public APIs
- Follow existing code patterns

### Shell Scripts

- Use `#!/bin/bash` shebang
- Add descriptive comments
- Use `set -e` for error handling
- Quote variables to prevent word splitting
- Use meaningful function names

### Documentation

- Use Markdown for all documentation
- Keep lines under 120 characters
- Use proper heading hierarchy
- Add code blocks with language hints
- Include examples where helpful

## Commit Guidelines

Follow [Conventional Commits](https://www.conventionalcommits.org/):

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, no logic change)
- `refactor`: Code refactoring
- `test`: Test additions or modifications
- `chore`: Maintenance tasks
- `perf`: Performance improvements
- `ci`: CI/CD changes

### Examples

```bash
# Simple feature
git commit -m "feat: add Windows WSL2 bootstrap script"

# Bug fix with scope
git commit -m "fix(golden-tests): correct SSIM threshold calculation"

# Breaking change
git commit -m "feat: update to Node 20.18.1

BREAKING CHANGE: Node 18 is no longer supported"

# Documentation
git commit -m "docs: add Windows setup troubleshooting guide"
```

## Getting Help

If you need help:

1. Check existing documentation
2. Search GitHub issues
3. Ask in PR comments
4. Create a new issue with the `question` label

## Code of Conduct

- Be respectful and inclusive
- Welcome newcomers
- Focus on constructive feedback
- Assume good intentions
- Help others learn and grow

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
