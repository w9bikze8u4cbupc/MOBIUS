# Contributing to Mobius Verification Scripts

Thank you for your interest in contributing to the Mobius Verification Scripts! This document provides guidelines for adding new checks and maintaining the codebase.

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
```bash
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