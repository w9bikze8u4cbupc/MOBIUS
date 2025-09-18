# Backward Compatibility Aliases for Verification Scripts

This document outlines how to add backward compatibility aliases to the verification scripts to support legacy flag names while maintaining the new canonical names.

## PowerShell Script Back-Compat Aliases

To add back-compat aliases to the PowerShell script, modify the `param()` block to include `[Alias()]` attributes:

```powershell
param(
  [string]$Server = "http://localhost:5001",
  [string]$Frontend = "http://localhost:3000",
  [Alias("MetricsToken")] [string]$MetricsTok,
  [switch]$StartStack,
  [string]$LocalTextPDF,
  [string]$LocalScannedPDF,
  [string]$RemotePDF,
  [string[]]$ImageUrls1 = @(),
  [string[]]$ImageUrls2 = @(),
  [int]$TimeoutDefault = 15,
  [int]$TimeoutPreview = 60,
  [switch]$Quiet,
  [Alias("JsonOut")] [string]$JsonSummary,           # e.g. -JsonSummary ".\mobius_summary.json"
  [string[]]$Only,                # e.g. -Only cors,ssrf,tts
  [Alias("JunitOut")] [string]$JUnitPath,             # e.g. -JUnitPath ".\mobius_junit.xml"
  [switch]$FailFast,              # stop on first FAIL
  [Alias("Timeout")] [int]$TimeoutDefault,
  [Alias("Retries")] [int]$Retries = 2,             # transient retries per HTTP call
  [int]$RetryDelayMs = 300,      # delay between retries
  [int]$PreviewMaxMs = 15000     # fail if render/preview exceeds this time
)
```

## Bash Script Back-Compat Aliases

To add back-compat aliases to the bash script, add additional case statements in the argument parsing section:

```bash
while [[ $# -gt 0 ]]; do
  case "$1" in
    --server) SERVER="$2"; shift 2;;
    --frontend) FRONTEND="$2"; shift 2;;
    --metrics-token|--metrics-token-legacy) METRICS_TOKEN="$2"; shift 2;;
    --start-stack) START_STACK="true"; shift;;
    --local-text-pdf) LOCAL_TEXT_PDF="$2"; shift 2;;
    --local-scanned-pdf) LOCAL_SCANNED_PDF="$2"; shift 2;;
    --remote-pdf) REMOTE_PDF="$2"; shift 2;;
    --image-urls1) IFS=, read -r -a IMAGE_URLS1 <<< "$2"; shift 2;;
    --image-urls2) IFS=, read -r -a IMAGE_URLS2 <<< "$2"; shift 2;;
    --timeout-default|--timeout) TIMEOUT_DEFAULT="$2"; shift 2;;
    --timeout-preview) TIMEOUT_PREVIEW="$2"; shift 2;;
    --quiet) QUIET="true"; shift;;
    --json-summary|--json-out) JSON_SUMMARY="$2"; shift 2;;
    --only) IFS=, read -r -a ONLY_KEYS <<< "$2"; shift 2;;
    --profile) PROFILE="$2"; shift 2;;
    --fail-fast) FAIL_FAST="true"; shift;;
    --junit|--junit-out) JUNIT_PATH="$2"; shift 2;;
    --tts-cache-ratio) TTS_CACHE_RATIO="$2"; shift 2;;
    --tts-cache-delta-ms) TTS_CACHE_DELTA_MS="$2"; shift 2;;
    --retry|--retries) RETRY="$2"; shift 2;;
    --retry-delay-ms) RETRY_DELAY_MS="$2"; shift 2;;
    --preview-max-ms) PREVIEW_MAX_MS="$2"; shift 2;;
    -h|--help) usage; exit 0;;
    *) echo "Unknown arg: $1"; usage; exit 2;;
  esac
done
```

## Deprecation Warning

To add deprecation warnings for legacy flags, you can modify the case statements to include echo statements:

```bash
# Bash example with deprecation warning
    --json-out) 
      echo "WARNING: --json-out is deprecated, use --json-summary instead" >&2
      JSON_SUMMARY="$2"; shift 2;;
    --junit-out) 
      echo "WARNING: --junit-out is deprecated, use --junit instead" >&2
      JUNIT_PATH="$2"; shift 2;;
    --timeout) 
      echo "WARNING: --timeout is deprecated, use --timeout-default instead" >&2
      TIMEOUT_DEFAULT="$2"; shift 2;;
    --retries) 
      echo "WARNING: --retries is deprecated, use --retry instead" >&2
      RETRY="$2"; shift 2;;

# PowerShell example with deprecation warning
  [Alias("JsonOut")] [string]$JsonSummary,
  [Alias("JunitOut")] [string]$JUnitPath,
  [Alias("Timeout")] [int]$TimeoutDefault,
  [Alias("Retries")] [int]$Retry,
```

Then in the script initialization, check if deprecated aliases were used and issue warnings:

```powershell
# PowerShell deprecation check example
if ($PSBoundParameters.ContainsKey('JsonOut')) {
  Write-Warning "--json-out is deprecated, use --json-summary instead"
}
if ($PSBoundParameters.ContainsKey('JunitOut')) {
  Write-Warning "--junit-out is deprecated, use --junit instead"
}
```

## Migration Path

1. **Phase 1**: Add aliases with deprecation warnings (1 release)
2. **Phase 2**: Remove aliases but keep warning logic (1 release)
3. **Phase 3**: Remove all deprecated code paths

This approach ensures a smooth transition for users while maintaining backward compatibility.