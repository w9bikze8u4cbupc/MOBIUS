# Coala Quick Reference

A quick guide to using coala in this project.

## Installation

### Using Virtual Environment (Recommended)

**Linux/macOS:**
```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install coala-bears
npm install
```

**Windows PowerShell:**
```powershell
py -3.10 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install coala-bears
npm install
```

### Using Docker (No Local Installation)

```bash
# For checking issues
docker run --rm -v "$(pwd):/app" --workdir=/app coala/base coala --non-interactive

# For applying automatic fixes
docker run --rm -v "$(pwd):/app" --workdir=/app coala/base coala -A
```

## Running Coala

### Preview Issues
```bash
coala --non-interactive
```

### Apply Automatic Fixes
```bash
coala -A
```

### Run Specific Checks
```bash
# Run only ESLint checks
coala --bears ESLintBear --files "**/*.ts,**/*.js" --non-interactive

# Run only security regex checks
coala --sections security-regex --non-interactive
```

## Key Security Checks

1. **Dynamic Code Execution**: Blocks `eval()` and `Function()`
2. **HTTP Only**: Enforces HTTPS for outbound requests
3. **Console Logs**: Flags raw `console.log()` usage
4. **Timeouts**: Ensures axios calls have timeouts
5. **BGG Allowlist**: Restricts requests to boardgamegeek.com
6. **User-Agent**: Requires User-Agent for BGG calls
7. **File Operations**: Blocks direct fs ops in handlers

## Configuration Files

- **[.coafile](.coafile)** - Main coala configuration
- **[eslint.config.js](eslint.config.js)** - ESLint v9 flat config
- **[.github/workflows/coala.yml](.github/workflows/coala.yml)** - CI/CD integration

## Pre-commit Hook

Set up automatic checking before commits:

**Linux/macOS:**
```bash
./scripts/setup-coala-precommit.sh
```

**Windows:**
```powershell
.\scripts\setup-coala-precommit.ps1
```

## Common Commands

```bash
# List all available bears
coala --show-bears

# Debug why a file wasn't checked
coala -V

# Check specific files
coala --files "src/**/*.js" --non-interactive
```

## Troubleshooting

### "coala is not found"
Make sure you've activated your virtual environment or use Docker.

### "ESLintBear is not found"
Ensure you've run `npm install` and that `node_modules/.bin` is in your PATH.

### "No bears matching"
Install coala-bears with `pip install coala-bears`.