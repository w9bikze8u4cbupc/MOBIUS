# Contributing to Mobius Verification Scripts

Thank you for your interest in contributing to the Mobius Verification Scripts! This document provides guidelines for adding new checks and maintaining the codebase.

## Developer onboarding — secure token handling & repo hooks

Before contributing to this repository, please ensure you've set up the pre-commit hooks that will prevent accidental commits of sensitive tokens.

### Install required tooling (if not already)
- Git, curl, jq (recommended), Node 18+, and your usual dev tools.

### Enable pre-commit hooks (one-time per machine)
- Unix/macOS:
  ```bash
  ./scripts/setup-hooks.sh
  ```

- Windows (PowerShell):
  ```powershell
  .\scripts\setup-hooks.ps1
  ```

The script symlinks/copies the [.githooks/*](file:///c:/Users/danie/Documents/mobius-games-tutorial-generator/.githooks) scripts into .git/hooks and verifies executable bits.

### What the hook does
- Scans staged files for token-like patterns (GitHub tokens, AWS, generic API keys).
- Blocks commits that appear to include secrets.

### Temporary bypass (use only with caution and document why you bypassed)
- `git commit --no-verify` OR set env `SKIP_TOKEN_HOOK=1` for the commit command.

### Testing the hook
- Stage a harmless test file that contains the token pattern `ghp_TESTTOKEN_EXAMPLE` to confirm it flags — do not stage real secrets.

### If you see false positives
- Report them in #dev-security with a minimal repro; we'll tune the regex and update the hook.

### Token best practices
- Use environment variables or OS secret store (do not commit .env files).
- Prefer short-lived / fine‑grained tokens and rotate monthly or per incident.
- Never paste tokens into chat or public threads.

### Need admin tasks?
- If you must run the branch-protection apply script and you are not an admin, ask an admin to run it or create the token with admin scope for that one operation and then rotate it.

### Onboarding checklist
Add this to onboarding checklist: "Run `scripts/setup-hooks.{sh,ps1}` and confirm commit hook blocks sample token."

## Adding New Checks

### Naming Convention
- Use lowercase, hyphen-separated identifiers (e.g., `cors`, `ssrf`, `tts-cache`)
- Be descriptive but concise
- Match the check name to its primary function

### Implementation Location
- **Bash**: Add your check in the appropriate section of `mobius_golden_path.sh`
- **PowerShell**: Add your check in the appropriate section of `mobius_golden_path.ps1`
- Follow the existing pattern of `should_run` guards for conditional execution

### Profile Declaration
Update the profile definitions in both scripts:
- **Bash**: Modify the profile expansion section around line 380
- **PowerShell**: Modify the profile expansion section around line 250

Example:
``bash
# Profile expansion
if [[ -n "$PROFILE" && ${#ONLY_KEYS[@]} -eq 0 ]]; then
  case "$PROFILE" in
    smoke) ONLY_KEYS=(readyz health cors ssrf tts preview your-new-check) ;;
    full)  ONLY_KEYS=(prereq start readyz health frontend metrics cors ssrf tts ajv images pdf preview hist pressure pm2 your-new-check) ;;
    *) echo "Unknown profile: $PROFILE"; exit 2;;
  esac
```

### Documentation Updates
- Update `README.md` common flags section if your check adds new parameters
- Update `VERIFICATION_SCRIPTS_OPERATIONAL_GUIDE.md` with details about your check
- Add your check to the profiles documentation

### Testing
- Add tests to `test/bash_dry_run_test.bats` for bash dry-run behavior
- Add tests to `test/powershell_dry_run_test.ps1` for PowerShell dry-run behavior
- Ensure your check works in both smoke and full profiles

## Code Quality and Static Analysis

This project uses [coala](https://coala.io/) for unified static analysis across JavaScript/TypeScript and Python. Before submitting a pull request, please ensure your code passes all static analysis checks.

### Running Static Analysis

To run coala static analysis:

```bash
# If you have coala installed locally
coala --non-interactive

# Or use Docker (no local installation required)
npm run lint:coala:unix  # Linux/macOS
npm run lint:coala       # Windows
```

### Automatic Fixes

To automatically fix issues that coala can resolve:

```bash
coala -A
```

### Pre-commit Hooks

We recommend setting up the pre-commit hook to automatically run coala before each commit:

```bash
# Linux/macOS
./scripts/setup-coala-precommit.sh

# Windows
.\scripts\setup-coala-precommit.ps1
```

### What coala Checks

- **Code Style**: Consistent formatting and spacing
- **Security**: Basic security linting for JS/TS and Python
- **Complexity**: Cognitive complexity and code duplication detection
- **Correctness**: Common bug patterns detection
- **Repo Hygiene**: JSON/Markdown validity and line length limits

For more details, see [COALA_INTEGRATION.md](COALA_INTEGRATION.md).

## Code Style Guidelines

### Bash Script
- Use `should_run` function to gate check execution
- Follow the existing logging pattern (`Info`, `Pass`, `Fail`, `Skip`)
- Use safe variable expansion with defaults (e.g., `${VAR:-default}`)
- Include proper error handling and cleanup

### PowerShell Script
- Use `[CmdletBinding()]` and proper parameter types
- Follow the existing logging pattern (`Info`, `Pass`, `Fail`, `Skipped`)
- Use splatting for `Invoke-WebRequest` to avoid null binding errors
- Include proper error handling with try/catch blocks

## Docs Parity
- Update `ci/docs-parity-check.ps1` to include any new flags
- Ensure all flags are documented in both `README.md` and `VERIFICATION_SCRIPTS_OPERATIONAL_GUIDE.md`

## Pull Request Process
1. Fork the repository
2. Create a feature branch
3. Implement your changes
4. Add tests for your changes
5. Update documentation
6. Ensure all tests pass
7. Submit a pull request with a clear description

## SemVer and Deprecation Policy
- **Patch (x.y.Z)**: bug fixes, doc tweaks, CI robustness; no flag changes
- **Minor (x.Y.z)**: non-breaking improvements, new checks behind profiles; alias additions allowed
- **Major (X.y.z)**: breaking changes; remove deprecated flags. Deprecations live ≥1 minor release and are announced in CHANGELOG and WARN at runtime.

## Known-good Support Matrix
- **OS**: Ubuntu-latest (bash), Windows-latest (PowerShell)
- **Shells**: bash 5+, pwsh 7+
- **Encodings**: all writes UTF-8
- **Dependencies** (optional): Tesseract for OCR-related INFOs; ffmpeg/ffprobe for media checks

## Questions?
Feel free to open an issue if you have questions about contributing or need clarification on any of these guidelines.