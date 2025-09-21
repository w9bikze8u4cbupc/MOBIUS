### Mobius Games Verification Scripts – Quickstart

[![GitHub Actions](https://github.com/w9bikze8u4cbupc/mobius-games-tutorial-generator/workflows/CI/badge.svg)](https://github.com/w9bikze8u4cbupc/mobius-games-tutorial-generator/actions)
[![Release](https://img.shields.io/github/v/release/w9bikze8u4cbupc/mobius-games-tutorial-generator)](https://github.com/w9bikze8u4cbupc/mobius-games-tutorial-generator/releases)
[![License](https://img.shields.io/github/license/w9bikze8u4cbupc/mobius-games-tutorial-generator)](LICENSE)

#### What is this
Cross-platform verification scripts for Mobius Games Tutorial Generator that validate security, performance, reliability, and connectivity. Two entry points:
- Bash: mobius_golden_path.sh
- PowerShell: mobius_golden_path.ps1

#### Prerequisites
- Server/API and frontend URLs reachable from the runner
- Optional metrics token (if metrics endpoint is protected)
- Recommended: at least one CI lane with NODE_ENV=production

#### Quickstart

PR smoke (bash):
```bash
mkdir -p artifacts
mobius_golden_path.sh \
  --profile smoke \
  --server http://localhost:5001 \
  --frontend http://localhost:3000 \
  --json-summary artifacts/summary.json \
  --junit artifacts/junit.xml \
  --fail-fast --quiet
```

PR smoke (PowerShell):
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

Nightly (full) with metrics token:
```bash
mkdir -p artifacts
mobius_golden_path.sh \
  --profile full \
  --server "$API_URL" \
  --frontend "$FRONTEND_URL" \
  --metrics-token "$METRICS_TOKEN" \
  --json-summary artifacts/summary.json \
  --junit artifacts/junit.xml
```

#### Sample Artifacts
For reference, sample artifacts demonstrating the output format can be found in the [sample_artifacts](sample_artifacts/) directory:
- [sample_junit.xml](sample_artifacts/sample_junit.xml) - Example JUnit XML output with timing attributes
- [sample_summary.json](sample_artifacts/sample_summary.json) - Example JSON summary output with schema validation

#### Common flags

**Bash (mobius_golden_path.sh)**
- --server, --frontend, --metrics-token
- --start-stack
- --local-text-pdf, --local-scanned-pdf, --remote-pdf
- --image-urls1, --image-urls2
- --timeout-default (seconds), --timeout-preview (seconds)
- --quiet, --fail-fast, --profile {smoke|full}, --only comma,list
- --json-summary PATH
- --junit PATH
- --retry N, --retry-delay-ms MS
- --preview-max-ms MS
- --tts-cache-ratio FLOAT, --tts-cache-delta-ms MS
- --dry-run, --version
- -h, --help

**PowerShell (mobius_golden_path.ps1)**
- -Server, -Frontend, -MetricsTok
- -StartStack
- -LocalTextPDF, -LocalScannedPDF, -RemotePDF
- -ImageUrls1, -ImageUrls2
- -TimeoutDefault (seconds), -TimeoutPreview (seconds)
- -Quiet, -FailFast, -Profile, -Only
- -JsonSummary PATH
- -JUnitPath PATH
- -RetryCount N, -RetryDelayMs MS
- -PreviewMaxMs MS
- -TtsCacheRatio FLOAT, -TtsCacheDeltaMs MS
- -DryRun, -Version

Note on units:
- TimeoutDefault/TimeoutPreview in seconds
- PreviewMaxMs/TtsCacheDeltaMs in milliseconds

#### Profiles
- smoke: readyz, health, CORS preflight, SSRF allow/deny, TTS (cache), preview timing
- full: everything in smoke plus metrics/histograms, AJV strictness, pressure/readiness, optional PM2 reload, optional image/PDF (guarded)

#### Outputs
- JSON summary: machine-readable results and timings
- JUnit XML: per-check test cases for CI annotations

#### CI Quickstart (GitHub Actions)
```yaml
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run smoke checks
        run: |
          mkdir -p artifacts
          ./mobius_golden_path.sh \
            --profile smoke \
            --server ${{ secrets.API_URL }} \
            --frontend ${{ secrets.FRONTEND_URL }} \
            --json-summary artifacts/summary.json \
            --junit artifacts/junit.xml \
            --fail-fast --quiet
      - name: Publish test report
        uses: mikepenz/action-junit-report@v4
        with:
          report_paths: artifacts/junit.xml
      - uses: actions/upload-artifact@v4
        with:
          name: verification-artifacts
          path: artifacts/
```

#### See also
[VERIFICATION_SCRIPTS_OPERATIONAL_GUIDE.md](VERIFICATION_SCRIPTS_OPERATIONAL_GUIDE.md) for full details and troubleshooting.

## Mobius Games Tutorial Generator

A pipeline for generating game tutorial videos from structured game rules.

## Development

This project includes several helper scripts to streamline development:

- `dev-up.sh` / `dev-up.ps1` - Start the development environment
- `dev-down.sh` / `dev-down.ps1` - Stop the development environment
- `dev-restart.sh` / `dev-restart.ps1` - Restart the development environment

### Enhanced Features

The development scripts now include several production-grade enhancements:

1. **Location Awareness**: Scripts can be run from any directory
2. **Log Rotation**: Old logs are timestamped and archived to prevent giant log files
3. **PID File Management**: Precise process control using PID files
4. **Force-Kill Capability**: Two-pass termination (graceful then force)
5. **Port Verification**: Ensures ports are actually free before exiting
6. **Optional Log Cleanup**: Logs preserved by default, cleaned only with explicit flag
7. **Smoke Testing**: Built-in quick validation of backend functionality

### Usage Examples

```bash
# Start development environment
./dev-up.sh

# Start with smoke test
./dev-up.sh --smoke

# Stop development environment
./dev-down.sh

# Clean shutdown (removes logs)
./dev-down.sh --clean-logs

# Restart with smoke test
./dev-restart.sh --smoke
```

```powershell
# Start development environment
.\dev-up.ps1

# Start with smoke test
.\dev-up.ps1 -Smoke

# Stop development environment
.\dev-down.ps1

# Clean shutdown (removes logs)
.\dev-down.ps1 -CleanLogs

# Restart with smoke test
.\dev-restart.ps1 -Smoke
```

### Static Analysis with coala

This project uses [coala](https://coala.io/) for unified static analysis across JavaScript/TypeScript and Python, with security linting, complexity analysis, and automatic fixes.

For setup instructions and usage, see [COALA_INTEGRATION.md](COALA_INTEGRATION.md).

**Quick setup:**

```bash
# Install coala (from project root)
python3 -m venv .venv
source .venv/bin/activate  # On Windows: .\.venv\Scripts\Activate.ps1
pip install coala-bears

# Install JS/TS dependencies
npm install
```

**Run analysis:**
```bash
coala --non-interactive
```

**Apply automatic fixes:**
```bash
coala -A
```

The configuration includes:
- ESLint v9 with security and complexity plugins for JS/TS
- BanditBear for Python security analysis
- RadonBear for Python complexity analysis
- SonarJS for JavaScript cognitive complexity
- Pre-commit hooks to prevent issues from being committed

Note: This project uses ESLint v9 with the new flat config format (`eslint.config.js`).
