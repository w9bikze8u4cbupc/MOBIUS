### Mobius Games Verification Scripts – Operational Guide

#### Overview
Golden-path verification for the Mobius Games Tutorial Generator. Designed for terminal-first use and CI: run, paste outputs, iterate quickly. Two scripts (bash/PowerShell) share the same checks and flags.

#### Profiles and Coverage
- smoke (PRs, fast): /readyz, /health, CORS preflight, SSRF allow/deny, TTS cache (cold vs warm), render/preview time gate, frontend→API proxy health.
- full (nightly/main): smoke + Prometheus metrics histograms after load, AJV strictness (ensure NODE_ENV=production on server), light CPU pressure then readiness, PM2 graceful reload (if available), optional image/PDF extraction (allowlisted inputs only).

#### Key Validations
- Security
  - CORS preflight: OPTIONS assertions for Access-Control-Allow-Methods (POST), Access-Control-Allow-Credentials, and Vary: Origin.
  - SSRF matrix: ALLOWED only valid BGG game pages; DENIED includes metadata IPs, loopback, internal ranges, self/metrics; aligned to /api/extract/bgg contract.
  - Helmet headers on health endpoints.
- Performance and Reliability
  - TTS caching: cold vs warm timing with ratio + delta thresholds.
  - Render/preview max duration gate (configurable PreviewMaxMs).
  - HTTP retries with backoff for transient failures.
  - Readiness under pressure: brief CPU burn then /readyz.
  - Metrics histograms: verify bucket presence after load.

#### Connectivity and Observability
- Frontend proxy health: validates UI→API path.
- Metrics endpoint: supports bearer token if protected.

#### Flags

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

Suggested defaults (tune per runner):
- timeout-default: 15s
- timeout-preview: 60s
- preview-max-ms: start generous (e.g., 15000 ms), tighten as stability improves
- retry: 2; retry-delay-ms: 300

Note on units:
- TimeoutDefault/TimeoutPreview in seconds
- PreviewMaxMs/TtsCacheDeltaMs in milliseconds

#### Sample Artifacts
For reference, sample artifacts demonstrating the output format can be found in the `sample_artifacts` directory:
- [sample_junit.xml](sample_artifacts/sample_junit.xml) - Example JUnit XML output with timing attributes
- [sample_summary.json](sample_artifacts/sample_summary.json) - Example JSON summary output with schema validation

#### Usage Examples

Run only security checks:
```bash
./mobius_golden_path.sh --profile smoke --server $API --frontend $FE --only cors,ssrf,helmet
```

Full run with artifacts and token:
```bash
./mobius_golden_path.sh --profile full --server $API --frontend $FE --metrics-token "$TOKEN" --json-summary artifacts/summary.json --junit artifacts/junit.xml
```

PowerShell smoke with fail-fast:
```powershell
.\mobius_golden_path.ps1 -Profile smoke -Server $env:API -Frontend $env:FE -FailFast -JsonSummary artifacts\summary.json -JUnitPath artifacts\junit.xml
```

Dry run to see what checks would execute:
```bash
./mobius_golden_path.sh --profile smoke --dry-run
```

Check version:
```bash
./mobius_golden_path.sh --version
```

#### CI Integration
Ensure one lane runs with the server's NODE_ENV=production to assert AJV strictness (client env alone won't change server behavior).
Publish JUnit XML for per-check annotations; upload JSON summary for dashboards.

GitHub Actions example:
```yaml
- name: Verify (full)
  run: |
    mkdir -p artifacts
    ./mobius_golden_path.sh \
      --profile full \
      --server ${{ secrets.API_URL }} \
      --frontend ${{ secrets.FRONTEND_URL }} \
      --metrics-token "${{ secrets.METRICS_TOKEN }}" \
      --json-summary artifacts/summary.json \
      --junit artifacts/junit.xml \
      --fail-fast
- uses: mikepenz/action-junit-report@v4
  with:
    report_paths: artifacts/junit.xml
- uses: actions/upload-artifact@v4
  with:
    name: verification-artifacts
    path: artifacts/
```

GitLab CI snippet:
```yaml
verify:
  image: alpine:latest
  script:
    - apk add --no-cache bash curl jq
    - mkdir -p artifacts
    - ./mobius_golden_path.sh --profile smoke --server $API_URL --frontend $FRONTEND_URL --json-summary artifacts/summary.json --junit artifacts/junit.xml
  artifacts:
    when: always
    paths:
      - artifacts/
```

#### Calibration Guidance
Start with lenient PreviewMaxMs and TTS thresholds; ratchet down as flakiness approaches zero.
Use --quiet in PR lanes to keep logs focused; keep full logs in nightly.
Employ --only to isolate failures quickly during triage.

#### Optional / Guarded Checks
PM2 graceful reload: runs only if PM2 is installed; verifies readiness across reload.
Image/PDF extraction: off by default; enable only with vetted, allowlisted URLs to avoid external flakiness.

#### Troubleshooting
CORS failures: check OPTIONS handling and headers (A-C-A-Methods includes POST; A-C-A-Credentials; Vary: Origin).
SSRF false negatives: confirm URLs match /api/extract/bgg contract exactly; verify deny list includes internal/self/metrics targets.
Metrics checks: confirm bearer token if endpoint protected; verify metrics path and histogram bucket names.
Timeouts/flakes: increase --timeout-default or --retry; inspect network/dns; consider an infra-sanity probe.
AJV strictness not applied: ensure server truly runs with NODE_ENV=production.

#### Next Steps
Wire smoke into PR CI and full into nightly.
Add build metadata (commit/version) to JSON/JUnit for traceability.
Consider an --infra-strict mode to SKIP known external flakes in PR runs.