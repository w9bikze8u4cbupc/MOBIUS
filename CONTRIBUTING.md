# Contributing to MOBIUS

Thank you for your interest in contributing to MOBIUS! This document provides guidelines and workflows for contributing to the project.

## Table of Contents

- [Development Setup](#development-setup)
- [Development Workflow](#development-workflow)
- [Testing Guidelines](#testing-guidelines)
- [Pull Request Process](#pull-request-process)
- [Code Style](#code-style)
- [Commit Messages](#commit-messages)

## Development Setup

### Prerequisites

- Node.js 20.18.1 or later
- npm 10.x or later
- Docker Desktop (for local staging/testing)
- ffmpeg (for video processing)

### Platform-Specific Setup

- **Windows:** See [docs/WINDOWS_SETUP.md](./docs/WINDOWS_SETUP.md) for WSL2 setup
- **macOS/Linux:** Standard Node.js and Docker installation

### Initial Setup

```bash
# Clone the repository
git clone https://github.com/w9bikze8u4cbupc/MOBIUS.git
cd MOBIUS

# Install dependencies
npm ci

# Verify environment
npm run verify-clean-genesis -- --verbose
```

## Development Workflow

### 1. Create a Branch

Always create a feature branch from `main`:

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
- `test/` - Test additions or changes

### 2. Make Changes

- Write clean, readable code
- Follow existing code style and patterns
- Add tests for new functionality
- Update documentation as needed

### 3. Test Your Changes

```bash
# Run unit tests
npm test

# Run verification
npm run verify-clean-genesis

# Test with Docker staging environment
docker build -f Dockerfile.ci -t mobius-api-ci:local .
docker compose -f docker-compose.staging.yml up -d --build
./scripts/ci/smoke-tests.sh http://localhost:5001 30 2
docker compose -f docker-compose.staging.yml down --volumes
```

### 4. Commit Changes

```bash
# Stage your changes
git add .

# Commit with descriptive message
git commit -m "feat: add feature description"
```

See [Commit Messages](#commit-messages) for conventions.

### 5. Push and Create PR

```bash
# Push your branch
git push -u origin feat/your-feature-name

# Open PR on GitHub
```

## Testing Guidelines

### Unit Tests

- Write tests for new functions and modules
- Maintain or improve test coverage
- Tests should be isolated and repeatable
- Use descriptive test names

```javascript
describe('myFunction', () => {
  it('should handle valid input correctly', () => {
    // Test implementation
  });

  it('should throw error for invalid input', () => {
    // Test implementation
  });
});
```

### Integration Tests

- Test end-to-end workflows
- Use the staging Docker environment
- Verify smoke tests pass

### Golden Tests

For video output verification:

```bash
# Generate golden reference
npm run golden:update

# Verify against golden
npm run golden:check
```

### Running Tests

```bash
# All tests
npm test

# Specific test file
npm test -- path/to/test.spec.ts

# With coverage
npm test -- --coverage

# Watch mode
npm test -- --watch
```

## Pull Request Process

### Before Creating PR

- [ ] All tests pass locally
- [ ] Code follows style guidelines
- [ ] Documentation is updated
- [ ] Commit messages follow conventions
- [ ] Branch is up to date with main

### PR Guidelines

1. **Title:** Use conventional commit format
   - `feat: Add Windows WSL2 setup guide`
   - `fix: Resolve Docker health check timeout`
   - `docs: Update README with quick start`

2. **Description:** Include:
   - Summary of changes
   - Why the change is needed
   - How to test the changes
   - Screenshots (for UI changes)
   - Related issues

3. **Keep it focused:**
   - One feature/fix per PR
   - Smaller PRs are easier to review
   - Split large changes into multiple PRs

4. **Ready for review:**
   - Remove WIP/draft status
   - Request reviewers
   - Respond to feedback promptly

### PR Template

```markdown
## Summary
Brief description of changes

## Changes
- Item 1
- Item 2
- Item 3

## Testing
How to test these changes

## Screenshots (if applicable)
Attach relevant screenshots

## Related Issues
Fixes #123
```

## Code Style

### JavaScript/TypeScript

- Use 2 spaces for indentation
- Use single quotes for strings
- Add semicolons
- Use meaningful variable names
- Comment complex logic

```javascript
// Good
function calculateDuration(start, end) {
  const duration = end - start;
  return duration;
}

// Bad
function calc(s,e){
return e-s
}
```

### File Organization

```
src/
  api/          # API endpoints
  utils/        # Utility functions
  types/        # Type definitions
scripts/        # Build and automation scripts
tests/          # Test files
docs/           # Documentation
```

### Error Handling

Always handle errors gracefully:

```javascript
try {
  const result = await riskyOperation();
  return result;
} catch (error) {
  console.error('Operation failed:', error);
  throw new Error(`Failed to complete operation: ${error.message}`);
}
```

### Async/Await

Prefer async/await over callbacks:

```javascript
// Good
async function fetchData() {
  const response = await fetch(url);
  const data = await response.json();
  return data;
}

// Avoid
function fetchData(callback) {
  fetch(url).then(response => {
    response.json().then(data => {
      callback(null, data);
    });
  });
}
```

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting, etc)
- `refactor:` - Code refactoring
- `test:` - Adding or updating tests
- `chore:` - Maintenance tasks

### Examples

```bash
feat: add Windows WSL2 bootstrap script

feat(docker): add staging compose with health checks

fix: resolve smoke test timeout issues

docs: update Windows setup guide with troubleshooting

test: add integration tests for verification script
```

### Commit Best Practices

- Keep commits atomic (one logical change per commit)
- Write clear, descriptive messages
- Reference issues when applicable (`Fixes #123`)
- Use imperative mood ("add feature" not "added feature")

## Documentation

### When to Update Docs

- Adding new features
- Changing APIs or interfaces
- Adding new scripts or tools
- Fixing bugs that affect usage
- Improving setup or workflows

### Documentation Standards

- Use clear, concise language
- Include code examples
- Add troubleshooting sections
- Keep table of contents updated
- Test all commands and examples

### Documentation Files

- `README.md` - Project overview and quick start
- `docs/WINDOWS_SETUP.md` - Windows-specific setup
- `CONTRIBUTING.md` - This file
- Code comments - For complex logic

## Getting Help

### Resources

- [GitHub Issues](https://github.com/w9bikze8u4cbupc/MOBIUS/issues)
- [Documentation](./docs/)
- [README](./README.md)

### Questions

If you have questions:

1. Check existing documentation
2. Search closed issues
3. Ask in an issue or discussion
4. Reach out to maintainers

## Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- Focus on the code, not the person
- Help others learn and grow

## License

By contributing, you agree that your contributions will be licensed under the same license as the project (MIT).

## Recognition

Contributors are recognized in:
- Git history
- Release notes
- Project documentation

Thank you for contributing to MOBIUS! 🎮🎥
