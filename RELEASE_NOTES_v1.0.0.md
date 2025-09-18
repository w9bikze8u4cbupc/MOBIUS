# Mobius Games Verification Scripts v1.0.0 Release Notes

## Summary
This release represents the production-ready v1.0.0 version of the Mobius Games Verification Scripts. The scripts provide comprehensive verification capabilities for the Mobius Games Tutorial Generator system, with cross-platform support for both bash and PowerShell environments.

## Key Features
- **Cross-platform support**: Bash (Linux/macOS) and PowerShell (Windows) implementations
- **Comprehensive validation**: Security, performance, and reliability checks
- **CI/CD integration**: JSON summaries, JUnit XML reports, and fail-fast options
- **Flexible execution**: Smoke (fast) and full (comprehensive) profiles
- **Configurable thresholds**: TTS cache ratios, preview timing limits, and retry policies

## Major Changes Since Last Review

### 1. Bash Script Improvements
- **Safe variable expansion**: Fixed variable expansion issues with `set -u` by using patterns like `${SERVER:-http://localhost:5001}`
- **Terminology consistency**: Standardized on "preview" instead of "timeline" throughout the script
- **Enhanced JUnit output**: Added proper XML entity escaping and timing attributes for richer CI reports
- **Improved error handling**: Better infrastructure failure reporting in JUnit XML

### 2. PowerShell Script Improvements
- **Missing Profile parameter**: Added the missing `-Profile` parameter to the param block
- **Terminology consistency**: Standardized on "preview" instead of "timeline" in profile definitions and section headers
- **Enhanced JUnit output**: Added proper XML entity escaping and timing attributes
- **Better logging**: Added timestamp tracking for all log entries

### 3. Documentation and CI/CD
- **Enhanced docs parity checking**: Added PowerShell param block validation to prevent documentation drift
- **JSON schema validation**: Added jq schema validation in CI workflow to ensure JSON summary structure
- **Sample artifacts**: Created sample JUnit XML and JSON summary files for reference
- **Comprehensive inventory**: Created SCRIPTS_INVENTORY.md documenting all scripts and their capabilities
- **Detailed changelog**: Added CHANGELOG.md with deprecation windows for backward compatibility aliases

### 4. Testing and Validation
- **Bash dry-run tests**: Added bats tests for bash script dry-run functionality
- **PowerShell tests**: Added Pester tests for PowerShell script param validation and dry-run output
- **Validation script**: Created comprehensive validation script to verify all implementation changes

### 5. Backward Compatibility
- **Alias support**: Maintained backward compatibility with deprecation warnings for legacy flags:
  - `--json-out` → `--json-summary`
  - `--junit-out` → `--junit`
  - `--timeout` → `--timeout-default`
  - `--retries` → `--retry`
  - `--metrics-token` → `--metrics-tok`
- **Deprecation window**: Clearly documented removal timeline (v2.0.0) in CHANGELOG.md

## Usage Examples

### Quick Start (Bash)
```bash
mkdir -p artifacts
./mobius_golden_path.sh \
  --profile smoke \
  --server http://localhost:5001 \
  --frontend http://localhost:3000 \
  --json-summary artifacts/summary.json \
  --junit artifacts/junit.xml \
  --fail-fast --quiet
```

### Quick Start (PowerShell)
```powershell
mkdir artifacts -ea 0 | Out-Null
.\mobius_golden_path.ps1 `
  -Profile smoke `
  -Server http://localhost:5001 `
  -Frontend http://localhost:3000 `
  -JsonSummary artifacts\summary.json `
  -JUnitPath artifacts\junit.xml `
  -FailFast `
  -Quiet
```

## Profiles
- **smoke**: Fast verification for PRs (readyz, health, CORS, SSRF, TTS, preview)
- **full**: Comprehensive verification (all smoke tests plus prerequisites, frontend, metrics, AJV, images, PDF, histograms, pressure, PM2)

## Outputs
- **JSON summary**: Machine-readable results with timing, environment, and threshold information
- **JUnit XML**: Per-check test cases with timing attributes for CI annotations

## CI/CD Integration
The scripts are designed for seamless CI/CD integration with features like:
- Fail-fast behavior for quick feedback
- Quiet mode for clean CI logs
- Configurable timeouts and retry policies
- JSON schema validation in CI workflows
- Cross-platform testing (Ubuntu, Windows)

## Next Steps
- Wire smoke profile into PR CI and full profile into nightly builds
- Add build metadata (commit/version) to JSON/JUnit outputs for traceability
- Consider implementing an --infra-strict mode to SKIP known external flakes in PR runs

This release is production-ready and addresses all the minor nits and quick fixes identified in the finalization checklist.