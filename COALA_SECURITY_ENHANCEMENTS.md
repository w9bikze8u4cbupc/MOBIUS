# Coala Security Enhancements

This document summarizes the security-focused enhancements made to the coala integration in this project.

## Overview

We've significantly enhanced the coala configuration with targeted security checks that reinforce the project's hardening policies. These enhancements provide automated detection of common security issues and policy violations.

## New Security Checks Added

### 1. Dynamic Code Execution Prevention
- **Check**: Blocks use of `eval()` and `Function()` constructor
- **Pattern**: `(?<![\w$])(eval|Function)\s*\(`
- **Severity**: Major
- **Rationale**: Dynamic code execution is a common source of security vulnerabilities

### 2. HTTPS Enforcement
- **Check**: Blocks HTTP URLs in outbound requests
- **Pattern**: `(fetch|axios\.(get|post|put|delete|patch))\s*\(\s*['"]http://`
- **Severity**: Major
- **Rationale**: Ensures all outbound requests use secure HTTPS connections

### 3. Console Log Management
- **Check**: Flags raw `console.log()` usage
- **Pattern**: `(?<!\.)\bconsole\.log\(`
- **Severity**: Minor
- **Rationale**: Encourages use of project logger instead of raw console output

### 4. Timeout Requirements
- **Check**: Ensures axios calls include timeout configuration
- **Pattern**: `axios\.(get|post|put|delete|patch)\([^)]*\)(?![^;]*timeout)`
- **Severity**: Minor
- **Rationale**: Prevents hanging requests that could impact application performance

### 5. BGG Host Allowlist Enforcement
- **Check**: Restricts outbound requests to BoardGameGeek domains
- **Pattern**: `(fetch|axios\.(get|post|put|delete|patch))\s*\(\s*['"]https?:\/\/(?!([w]{3}\.)?boardgamegeek\.com)`
- **Severity**: Major
- **Rationale**: Prevents accidental requests to non-approved external services

### 6. User-Agent Header Requirements
- **Check**: Ensures BGG calls include User-Agent headers
- **Pattern**: `(fetch\([^)]*boardgamegeek\.com[^)]*\)(?![^}]*['"]User-Agent['"]))|(axios\.[^(]+\([^)]*boardgamegeek\.com[^)]*\)(?![^}]*timeout))`
- **Severity**: Major
- **Rationale**: BGG API requires proper identification for rate limiting and analytics

### 7. Direct File System Operation Prevention
- **Check**: Blocks direct fs operations in API handlers
- **Pattern**: `(?<!worker)[\s;]fs\.(read|write|unlink|mkd)ir`
- **Severity**: Minor
- **Rationale**: Encourages use of worker pools for file operations to prevent blocking the event loop

## ESLint Configuration Enhancements

### Added Plugins
- `eslint-plugin-import` - For proper import statement handling
- `eslint-plugin-promise` - For proper Promise usage
- `eslint-plugin-security` - For security-focused linting rules
- `eslint-plugin-sonarjs` - For cognitive complexity analysis

### Added Rules
- `import/order` - Enforces consistent import ordering
- `promise/no-return-wrap` - Prevents unnecessary Promise wrapping
- `security/detect-object-injection` - Disabled (too noisy for this codebase)
- `sonarjs/cognitive-complexity` - Warns on overly complex code
- `complexity` - Warns on functions with too many branches
- `max-lines` - Limits file size
- `max-lines-per-function` - Limits function size

## Implementation Details

### .coafile Updates
The [.coafile](.coafile) has been enhanced with seven new regex-based security checks that target specific patterns in the codebase:

1. Security regex checks for dynamic code execution
2. HTTP-only blocking for outbound requests
3. Raw console log detection
4. Missing timeout detection for axios calls
5. BGG host allowlist enforcement
6. User-Agent header requirements for BGG calls
7. Direct file system operation prevention in handlers

### ESLint Configuration
The [eslint.config.js](eslint.config.js) has been updated to include the new plugins and rules:

1. Added import, promise, security, and sonarjs plugins
2. Configured additional rules for code quality and security
3. Maintained compatibility with ESLint v9 flat config format

### Dependency Management
All required dependencies have been added to [package.json](package.json):

1. `eslint-plugin-import`
2. `eslint-plugin-promise`
3. `eslint-plugin-security`
4. `eslint-plugin-sonarjs`

## Benefits

### Security Hardening
- Automated detection of common security anti-patterns
- Policy enforcement for external service access
- Prevention of performance issues from missing timeouts

### Code Quality
- Consistent import ordering
- Proper Promise usage patterns
- Cognitive complexity management
- File and function size limits

### Developer Experience
- Clear error messages for policy violations
- Automated enforcement in CI/CD
- Gradual adoption through warning levels

## Usage

### Running Security Checks
```bash
# Using Docker (recommended if coala is not installed locally)
docker run --rm -v "$(pwd):/app" --workdir=/app coala/base coala --non-interactive

# If coala is installed locally
coala --non-interactive
```

### Applying Automatic Fixes
```bash
# Using Docker
docker run --rm -v "$(pwd):/app" --workdir=/app coala/base coala -A

# If coala is installed locally
coala -A
```

## CI/CD Integration

The security checks are automatically enforced through the existing GitHub Actions workflow in [.github/workflows/coala.yml](.github/workflows/coala.yml), which runs on all pushes and pull requests.

## Future Improvements

1. **Fine-tuning**: Adjust regex patterns based on actual codebase patterns
2. **Additional Checks**: Add more targeted security checks as needed
3. **Severity Management**: Adjust warning levels based on team preferences
4. **Custom Rules**: Develop project-specific linting rules

## Conclusion

These security enhancements provide a robust foundation for maintaining security best practices in the project. The automated checks help prevent common security issues while the policy enforcement ensures compliance with external service access requirements.