# Coala Integration Guide

This project uses [coala](https://coala.io/) for unified code analysis across JavaScript/TypeScript and Python, with automatic fixes where safe and repeatable checks in CI.

## What coala improves

- **Consistency/style**: Standardized formatting and spacing; fewer "nit" PR comments
- **Correctness**: Common bug patterns via ESLint rules and PyLint
- **Security hygiene**: Basic JS/TS and Python security linting
- **Maintainability**: Complexity warnings and duplicate code detection
- **Repo hygiene**: JSON/Markdown validity and line-length

## Setup

### 1. Install coala (in a virtualenv) and ESLint deps

**Linux/macOS:**
```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install coala-bears
```

**Windows (PowerShell):**
```powershell
py -3.10 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install coala-bears
```

**ESLint for JS/TS (run in your repo):**
```bash
npm install
```

The required ESLint dependencies are already included in `package.json`.

Note: This project uses ESLint v9, which requires the new flat config format (`eslint.config.js`) instead of the traditional `.eslintrc.json` format. The configuration has been updated accordingly.

### 2. Configuration

This project already includes:
- `.coafile` - Main coala configuration targeting JS/TS + Python
- `.eslintrc.json` - ESLint configuration with security and complexity rules
- `.github/workflows/coala.yml` - GitHub Actions workflow for CI enforcement

### 3. First run and quick fixes

**Preview issues:**
```bash
coala --non-interactive
```

**Apply safe autofixes (where supported):**
```bash
coala -A
```

### 4. Pre-commit hook setup

To automatically run coala before each commit:

**Linux/macOS:**
```bash
./scripts/setup-coala-precommit.sh
```

**Windows:**
```powershell
.\scripts\setup-coala-precommit.ps1
```

### 5. CI enforcement

The GitHub Actions workflow in `.github/workflows/coala.yml` will automatically run coala on all pushes and pull requests.

## Targeted improvements for this codebase

### Backend Node/Express
- Enforce no raw `console.log` in production; require the project logger
- Disallow http URLs (only https) in code constants
- Flag long functions/handlers; split parsing/IO/error paths

### Security
- ESLint security plugin: basic sink/source checks
- BanditBear for any Python helpers

### Complexity and duplication
- RadonBear for Python complexity hot spots
- SonarJS plugin highlights JS/TS cognitive complexity and duplicate branches

### Repo hygiene
- JSON/Markdown/YAML bears keep config tidy and CI-friendly

## Workflow you can follow weekly

1. Run coala locally; apply autofixes with `-A`
2. Triage remaining warnings; add targeted refactors to reduce complexity
3. If a rule is noisy and not useful, relax or disable it in `.coafile` or ESLint per-file with comments
4. Let CI block regressions on PRs

## One-shot check with Docker

If you prefer not to install coala locally:

**Linux/macOS:**
```bash
docker run -ti -v "$(pwd)":/app --workdir=/app coala/base coala --non-interactive
```

**Windows (PowerShell):**
```powershell
docker run -ti -v "${PWD}:/app" --workdir=/app coala/base coala --non-interactive
```

## Custom ESLint Rules

The project's ESLint configuration includes several plugins for enhanced code quality:

- `@typescript-eslint` - TypeScript-specific linting rules
- `security` - Security-focused linting rules
- `import` - Rules for proper import statements
- `promise` - Rules for proper Promise usage
- `sonarjs` - Rules for cognitive complexity and code smells

Key custom rules:
- Disallows HTTP URLs in favor of HTTPS for security
- Enforces function complexity limits
- Warns on excessive console usage (except `console.warn` and `console.error`)
- Limits file and function sizes
- Enforces import ordering
- Ensures proper Promise usage

Note: With ESLint v9, the configuration uses the new flat config format in `eslint.config.js` instead of the traditional `.eslintrc.json` format.

## Security-Focused Regex Checks

In addition to ESLint rules, coala includes targeted regex-based security checks:

- Dynamic code execution prevention (eval/Function)
- HTTPS enforcement for outbound requests
- Raw console log detection
- Missing timeout detection for axios calls
- BGG host allowlist enforcement
- User-Agent header requirements for BGG calls
- Direct file system operation prevention in handlers

## Troubleshooting

### "coala is not found" error

Make sure you've activated your virtual environment:
```bash
source .venv/bin/activate  # Linux/macOS
# or
.\.venv\Scripts\Activate.ps1  # Windows
```

### "ESLintBear is not found" error

Install the required dependencies:
```bash
npm install
```

### "No bears matching" error

Install coala-bears:
```bash
pip install coala-bears
```