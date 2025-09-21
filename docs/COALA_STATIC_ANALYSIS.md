# coala Static Analysis for Mobius Games Tutorial Generator

This document explains how to set up and use coala for static analysis in the Mobius Games Tutorial Generator project.

## What is coala?

coala is a unified static analysis tool that provides a common interface for linting and fixing code in multiple programming languages. It supports various bears (analysis tools) for different languages and can be configured through a single `.coafile`.

## Prerequisites

- Docker (recommended for easiest setup)
- Git

## Installation Options

### Option A: Docker (Recommended - No Local Setup Required)

#### Linux/macOS:

```bash
docker run -ti -v "$(pwd)":/app --workdir=/app coala/base \
  coala --files="**/*.js" --bears=ESLintBear --save
```

#### Windows (PowerShell):

```powershell
docker run -ti -v "${PWD}:/app" --workdir=/app coala/base `
  coala --files="**/*.js" --bears=ESLintBear --save
```

This approach requires no local Python or Node.js installation and is the most reliable way to run coala.

### Option B: Native Installation (Advanced Users)

For those who prefer native installation, you'll need:

- Python 3.8-3.10 (recommended, as coala/bears can be flaky on newer versions)
- Node.js 18+ (needed for JavaScript/TypeScript linting via ESLintBear)

The native installation can be complex due to dependency issues, so Docker is recommended for most users.

## Configuration

The project includes a `.coafile` in the root directory that is configured for:

- JavaScript/TypeScript files (using ESLintBear)
- Python files (using PEP8Bear, PyLintBear, etc.)
- Markdown files (using MarkdownBear)
- JSON files (using JSONFormatBear)
- HTML files (using HTMLLintBear)
- CSS/SCSS files (using CSSLintBear)

The configuration excludes common build directories, node_modules, and other non-source files.

## Running coala with Docker

### Basic Analysis

```bash
# From the project root directory
docker run -ti -v "$(pwd)":/app --workdir=/app coala/base coala --non-interactive
```

On Windows:
```powershell
# From the project root directory
docker run -ti -v "${PWD}:/app" --workdir=/app coala/base coala --non-interactive
```

### Analyze Specific Files

```bash
docker run -ti -v "$(pwd)":/app --workdir=/app coala/base coala --files="src/api/index.js" --non-interactive
```

### Auto-fix Issues (when possible)

```bash
docker run -ti -v "$(pwd)":/app --workdir=/app coala/base coala -A
```

## GitHub Actions Integration

The project includes a GitHub Actions workflow at `.github/workflows/coala.yml` that will automatically run coala analysis on push and pull requests.

## Bears Included in This Configuration

- **ESLintBear**: JavaScript/TypeScript linting using ESLint
- **PEP8Bear**: Python PEP8 style checking
- **PyLintBear**: Python code analysis
- **RadonBear**: Python complexity analysis
- **LineLengthBear**: Line length checking
- **SpaceConsistencyBear**: Whitespace consistency
- **DuplicateFileBear**: Detection of duplicate files
- **MarkdownBear**: Markdown linting
- **JSONFormatBear**: JSON formatting
- **HTMLLintBear**: HTML linting
- **CSSLintBear**: CSS linting
- **FilenameBear**: Filename conventions

## Project-Specific Configuration

The current configuration is tailored for the Mobius Games Tutorial Generator project:

- Excludes build artifacts, node_modules, logs, and temporary files
- Supports both frontend (React) and backend (Node.js/Express) code
- Handles JavaScript, TypeScript, JSON, Markdown, HTML, and CSS files
- Uses the project's existing ESLint configuration

## Troubleshooting

If you encounter issues with the Docker approach:

1. Ensure Docker is running
2. Check that you're running the command from the project root
3. Verify that the .coafile exists in the project root
4. Try running with verbose output to see detailed logs

## Additional Resources

- [coala Documentation](https://docs.coala.io/)
- [coala Bears List](https://coala.io/#/languages)
- [ESLint Documentation](https://eslint.org/)
- [PEP 8 Style Guide](https://pep8.org/)