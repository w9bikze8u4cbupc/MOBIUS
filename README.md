### Mobius Games Verification Scripts – Quickstart

#### What is this
Cross-platform verification scripts for Mobius Games Tutorial Generator that validate security, performance, reliability, and connectivity. Two entry points:
- Bash: mobius_golden_path.sh
- PowerShell: mobius_golden_path.ps1

#### Prerequisites
- Server/API and frontend URLs reachable from the runner
- Optional metrics token (if metrics endpoint is protected)
- Recommended: at least one CI lane with NODE_ENV=production

#### Quickstart

Bash (PR smoke):
```bash
mkdir -p artifacts
./mobius_golden_path.sh \
  --profile smoke \
  --server http://localhost:3000 \
  --frontend http://localhost:8080 \
  --json-summary artifacts/summary.json \
  --junit artifacts/junit.xml \
  --fail-fast --quiet
```

PowerShell (PR smoke):
```powershell
mkdir artifacts -ea 0 | Out-Null
.\mobius_golden_path.ps1 `
  -Profile smoke `
  -Server http://localhost:3000 `
  -Frontend http://localhost:8080 `
  -JsonSummary artifacts\summary.json `
  -JUnitPath artifacts\junit.xml `
  -FailFast `
  -Quiet
```

Nightly (full) with metrics token:
```bash
./mobius_golden_path.sh \
  --profile full \
  --server "$API_URL" \
  --frontend "$FRONTEND_URL" \
  --metrics-token "$METRICS_TOKEN" \
  --json-summary artifacts/summary.json \
  --junit artifacts/junit.xml
```

#### Sample Artifacts
For reference, sample artifacts demonstrating the output format can be found in the `sample_artifacts` directory:
- [sample_junit.xml](sample_artifacts/sample_junit.xml) - Example JUnit XML output
- [sample_summary.json](sample_artifacts/sample_summary.json) - Example JSON summary output

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
VERIFICATION_SCRIPTS_OPERATIONAL_GUIDE.md for full details and troubleshooting.