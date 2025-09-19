# Mobius Verification Scripts v1.0.0

## Highlights
- Canonical flag parity across Bash and PowerShell
- Dry-run mode to preview checks with zero network calls
- Metadata-rich artifacts: JSON summary + JUnit with timing
- Cross-OS CI matrix (Ubuntu bash, Windows PowerShell)
- Docs-parity guardrail to prevent drift
- Back-compat aliases with deprecation window

## Flags (canonical)
- Server/Frontend endpoints
- Profiles: smoke, full
- Artifacts: --json-summary / -JsonSummary, --junit / -JUnitPath
- Reliability: --retry, --retry-delay-ms
- Performance: --preview-max-ms, --tts-cache-ratio, --tts-cache-delta-ms
- Ops: --fail-fast, --quiet, --version, --dry-run

## Deprecations
- Aliases retained with WARN until v2.0.0:
  - JsonOut → JsonSummary
  - JunitOut → JUnitPath
  - Retries → RetryCount
  - json-out/junit-out (bash) → json-summary/junit
See CHANGELOG for details and removal timeline.

## CI & Docs
- Required checks: Linux smoke, Windows smoke, docs-parity, JSON schema (jq)
- Sample artifacts included for reference
- Operational guide and README updated with quickstart

## How to run (PR smoke)
- Bash:
  ```bash
  mobius_golden_path.sh --profile smoke --json-summary artifacts/summary.json --junit artifacts/junit.xml
  ```
- PowerShell:
  ```powershell
  .\mobius_golden_path.ps1 -Profile smoke -JsonSummary artifacts\summary.json -JUnitPath artifacts\junit.xml
  ```

## Thanks
- Contributors: <add names/handles>

Professional-grade cross-platform verification scripts for the Mobius Games Tutorial Generator system. Designed for terminal-first use and CI: run, paste outputs, iterate quickly.

## 🎯 Key Features

### Cross-Platform Support
- **Bash** (Linux/macOS): `mobius_golden_path.sh`
- **PowerShell** (Windows): `mobius_golden_path.ps1`

### Comprehensive Validation
- **Security**: CORS preflight, SSRF allow/deny matrix, Helmet headers
- **Performance**: TTS cache thresholds, render/preview time gates
- **Reliability**: HTTP retries with backoff, fail-fast option
- **Connectivity**: Frontend proxy health, metrics protection

### CI-Ready Features
- **JSON summaries**: Machine-readable results with timing and metadata
- **JUnit XML reports**: Per-check test cases for CI annotations
- **Profiles**: Smoke (PRs/fast) vs. Full (nightly/comprehensive)
- **Selective execution**: Run only specific test blocks
- **Quiet mode**: Suppress INFO logs for clean CI output

## 🚀 Canonical Flags

### Core Configuration
- `--server`, `--frontend`, `--metrics-token` (Bash) / `-Server`, `-Frontend`, `-MetricsTok` (PowerShell)
- `--start-stack` / `-StartStack`: Run 'npm run dev' in background
- `--timeout-default`, `--timeout-preview` / `-TimeoutDefault`, `-TimeoutPreview`: Configurable timeouts
- `--quiet` / `-Quiet`: Suppress INFO logs

### Execution Control
- `--profile {smoke|full}` / `-Profile`: Predefined test sets
- `--only CSV` / `-Only`: Run only specific test blocks
- `--fail-fast` / `-FailFast`: Stop on first failure
- `--dry-run` / `-DryRun`: Print checks without executing

### Output & Reporting
- `--json-summary PATH` / `-JsonSummary`: Write JSON summary
- `--junit PATH` / `-JUnitPath`: Write JUnit XML report

### Performance Gates
- `--preview-max-ms MS` / `-PreviewMaxMs`: Fail if render/preview exceeds time
- `--tts-cache-ratio FLOAT` / `-TtsCacheRatio`: TTS warm/cold ratio threshold
- `--tts-cache-delta-ms INT` / `-TtsCacheDeltaMs`: TTS warm must be < cold - delta

### Reliability
- `--retry N` / `-RetryCount`: HTTP retry count per call
- `--retry-delay-ms MS` / `-RetryDelayMs`: Delay between retries

## 📋 Profiles

### Smoke (PRs, fast)
`readyz`, `health`, `CORS preflight`, `SSRF allow/deny`, `TTS cache`, `preview timing`

### Full (nightly/main)
Everything in smoke plus `prerequisites`, `start`, `frontend`, `metrics`, `AJV strictness`, `images`, `PDF`, `histograms`, `pressure`, `PM2`

## 🛡️ Docs Parity Guardrail

CI job validates that all canonical flags are documented in README.md and VERIFICATION_SCRIPTS_OPERATIONAL_GUIDE.md, preventing drift between implementation and documentation.

## ⚠️ Deprecation Window

Backward compatibility aliases with deprecation warnings:
- `--json-out` → `--json-summary` (Will be removed in v2.0.0)
- `--junit-out` → `--junit` (Will be removed in v2.0.0)
- `--timeout` → `--timeout-default` (Will be removed in v2.0.0)
- `--retries` → `--retry` (Will be removed in v2.0.0)
- `--metrics-token-legacy` → `--metrics-token` (Will be removed in v2.0.0)

## 📚 Documentation

- [README.md](README.md) - Quickstart guide
- [VERIFICATION_SCRIPTS_OPERATIONAL_GUIDE.md](VERIFICATION_SCRIPTS_OPERATIONAL_GUIDE.md) - Detailed operational guide
- [SCRIPTS_INVENTORY.md](SCRIPTS_INVENTORY.md) - Comprehensive inventory of all scripts
- [Sample Artifacts](sample_artifacts/) - Example JSON and JUnit outputs

## 🧪 Testing

- [Bash dry-run tests](test/bash_dry_run_test.bats)
- [PowerShell dry-run tests](test/powershell_dry_run_test.ps1)

## 📈 Monitoring

- Per-check timing metrics in JSON output
- Deprecated alias usage tracking
- Dashboard counters for migration progress

## 🤝 Contributing

- [CONTRIBUTING.md](CONTRIBUTING.md) - Guidelines for adding new checks
- Issue templates for [bug reports](.github/ISSUE_TEMPLATE/bug_verification.yml) and [feature requests](.github/ISSUE_TEMPLATE/feature_check.yml)