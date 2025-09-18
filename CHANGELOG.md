# Changelog

All notable changes to the Mobius Games Verification Scripts will be documented in this file.

## [1.0.0] - 2025-09-17

### Added
- Initial release of verification scripts for Mobius Games Tutorial Generator
- Cross-platform support (bash and PowerShell)
- Comprehensive security, performance, and reliability checks
- CI-ready features including JSON summaries and JUnit XML reports
- Support for smoke and full verification profiles
- Backward compatibility aliases with deprecation warnings

### Deprecated
- `--json-out` flag (use `--json-summary` instead) - Will be removed in v2.0.0
- `--junit-out` flag (use `--junit` instead) - Will be removed in v2.0.0
- `--timeout` flag (use `--timeout-default` instead) - Will be removed in v2.0.0
- `--retries` flag (use `--retry` instead) - Will be removed in v2.0.0
- `--metrics-token` flag (use `--metrics-tok` instead) - Will be removed in v2.0.0

### Fixed
- Bash script variable expansion issues with `set -u`
- Terminology consistency (standardized on "preview" instead of "timeline")
- Proper XML entity escaping in JUnit output
- Timing attributes in JUnit XML for richer CI reports
- Enhanced docs parity checking for PowerShell flags