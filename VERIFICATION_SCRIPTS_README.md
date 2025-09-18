# Mobius Games Tutorial Generator - Verification Scripts

## Quick Start

### PowerShell (Windows)
```powershell
# Quick smoke test
.\mobius_golden_path.ps1 -Profile smoke

# Full verification with artifacts
.\mobius_golden_path.ps1 -Profile full -JUnitPath .\mobius_junit.xml -JsonSummary .\mobius_summary.json
```

### Bash (Linux/macOS)
```bash
# Quick smoke test
./mobius_golden_path.sh --profile smoke

# Full verification with artifacts
./mobius_golden_path.sh --profile full --junit /tmp/mobius_junit.xml --json-summary /tmp/mobius_summary.json
```

## Key Features

- ✅ **Security Validation**: CORS, SSRF, Helmet headers
- ✅ **Performance Gates**: TTS cache, render/preview timing
- ✅ **Reliability**: HTTP retries, fail-fast option
- ✅ **CI-Ready**: JSON summaries, JUnit XML reports
- ✅ **Profiles**: Smoke (fast) vs. Full (comprehensive)

## For Detailed Usage

See [VERIFICATION_SCRIPTS_OPERATIONAL_GUIDE.md](VERIFICATION_SCRIPTS_OPERATIONAL_GUIDE.md) for complete documentation.