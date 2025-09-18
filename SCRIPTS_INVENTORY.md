# Scripts Inventory

## Core Verification Scripts

### mobius_golden_path.sh (Bash)
Cross-platform verification script for the Mobius Games Tutorial Generator system.

**Features:**
- Security Checks: CORS preflight, SSRF allow/deny matrix, Helmet headers
- Performance Gates: TTS cache thresholds, render/preview time limits
- Reliability: HTTP retries with backoff, fail-fast option
- CI Integration: JSON summaries, JUnit XML reports, quiet mode
- Profiles: Smoke (PRs/fast) vs. Full (nightly/comprehensive)
- Cross-platform: bash 4.0+ compatible

**Canonical Flags:**
- `--server`, `--frontend`, `--metrics-token`
- `--start-stack`
- `--local-text-pdf`, `--local-scanned-pdf`, `--remote-pdf`
- `--image-urls1`, `--image-urls2`
- `--timeout-default` (seconds), `--timeout-preview` (seconds)
- `--quiet`, `--fail-fast`, `--profile {smoke|full}`, `--only comma,list`
- `--json-summary PATH`
- `--junit PATH`
- `--retry N`, `--retry-delay-ms MS`
- `--preview-max-ms MS`
- `--tts-cache-ratio FLOAT`, `--tts-cache-delta-ms MS`
- `--dry-run`, `--version`
- `-h`, `--help`

**Backward Compatibility Aliases (deprecated):**
- `--json-out` → `--json-summary`
- `--junit-out` → `--junit`
- `--timeout` → `--timeout-default`
- `--retries` → `--retry`
- `--metrics-token-legacy` → `--metrics-token`

### mobius_golden_path.ps1 (PowerShell)
Cross-platform verification script for the Mobius Games Tutorial Generator system.

**Features:**
- Security Checks: CORS preflight, SSRF allow/deny matrix, Helmet headers
- Performance Gates: TTS cache thresholds, render/preview time limits
- Reliability: HTTP retries with backoff, fail-fast option
- CI Integration: JSON summaries, JUnit XML reports, quiet mode
- Profiles: Smoke (PRs/fast) vs. Full (nightly/comprehensive)
- Cross-platform: PowerShell 5.1+ and PowerShell 7+ compatible

**Canonical Flags:**
- `-Server`, `-Frontend`, `-MetricsTok`
- `-StartStack`
- `-LocalTextPDF`, `-LocalScannedPDF`, `-RemotePDF`
- `-ImageUrls1`, `-ImageUrls2`
- `-TimeoutDefault` (seconds), `-TimeoutPreview` (seconds)
- `-Quiet`, `-FailFast`, `-Profile`, `-Only`
- `-JsonSummary PATH`
- `-JUnitPath PATH`
- `-RetryCount N`, `-RetryDelayMs MS`
- `-PreviewMaxMs MS`
- `-TtsCacheRatio FLOAT`, `-TtsCacheDeltaMs MS`
- `-DryRun`, `-Version`

**Backward Compatibility Aliases (deprecated):**
- `-JsonOut` → `-JsonSummary`
- `-JunitOut` → `-JUnitPath`
- `-Timeout` → `-TimeoutDefault`
- `-Retries` → `-RetryCount`
- `-MetricsToken` → `-MetricsTok`

## CI/CD Scripts

### ci/docs-parity-check.ps1
Prevents drift between script flags and documentation.

**Features:**
- Validates that all canonical flags are documented
- Checks both bash and PowerShell flags
- Enhanced validation for PowerShell param block flags

### test/bash_dry_run_test.bats
Bats test for bash script dry-run functionality.

**Features:**
- Validates dry-run output for smoke profile
- Validates dry-run output for full profile

### test/powershell_dry_run_test.ps1
Pester test for PowerShell script dry-run functionality.

**Features:**
- Validates param block contains canonical flags
- Validates dry-run output for smoke profile
- Validates dry-run output for full profile

## Configuration Files

### .github/workflows/ci.yml
GitHub Actions workflow for CI/CD.

**Features:**
- Cross-platform testing (Ubuntu, Windows)
- Docs parity checking
- Smoke testing on both platforms
- JSON schema validation
- JUnit report publishing
- Artifact uploading

## Documentation

### README.md
Quickstart guide for the verification scripts.

### VERIFICATION_SCRIPTS_OPERATIONAL_GUIDE.md
Detailed operational guide for the verification scripts.

### CHANGELOG.md
Changelog documenting changes to the scripts.