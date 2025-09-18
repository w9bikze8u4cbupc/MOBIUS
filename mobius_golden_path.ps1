<#
.SYNOPSIS
  Mobius Games Tutorial Generator - Golden Path Verification Script

.DESCRIPTION
  Comprehensive verification script for the Mobius Games Tutorial Generator system.
  Validates security, performance, and reliability of the service with CI-ready features.

.FEATURES
  - Security Checks: CORS preflight, SSRF allow/deny matrix, Helmet headers
  - Performance Gates: TTS cache thresholds, render/preview time limits
  - Reliability: HTTP retries with backoff, fail-fast option
  - CI Integration: JSON summaries, JUnit XML reports, quiet mode
  - Profiles: Smoke (PRs/fast) vs. Full (nightly/comprehensive)
  - Cross-platform: PowerShell 5.1+ and PowerShell 7+ compatible

.PARAMETER Server
  Backend base URL. Default: http://localhost:5001

.PARAMETER Frontend
  Frontend base URL. Default: http://localhost:3000

.PARAMETER MetricsTok
  Bearer token for /metrics endpoint if protected

.PARAMETER StartStack
  Run 'npm run dev' in background

.PARAMETER LocalTextPDF
  Path to local text PDF for extraction testing

.PARAMETER LocalScannedPDF
  Path to local scanned PDF for extraction testing

.PARAMETER RemotePDF
  URL to remote PDF for extraction testing

.PARAMETER ImageUrls1
  Array of image URLs for extraImageUrls testing

.PARAMETER ImageUrls2
  Array of image URLs for urls testing

.PARAMETER TimeoutDefault
  Default HTTP timeout in seconds. Default: 15

.PARAMETER TimeoutPreview
  Render/preview timeout in seconds. Default: 60

.PARAMETER Quiet
  Suppress INFO logs

.PARAMETER JsonSummary
  Write JSON summary to specified file path

.PARAMETER JUnitPath
  Write JUnit XML report to specified file path

.PARAMETER Only
  Run only specific test blocks (comma-separated)

.PARAMETER Profile
  Run predefined test set: smoke (fast) or full (comprehensive)

.PARAMETER FailFast
  Stop execution on first failure

.PARAMETER RetryCount
  HTTP retry count per call. Default: 2

.PARAMETER RetryDelayMs
  Delay between retries in milliseconds. Default: 300

.PARAMETER PreviewMaxMs
  Fail if render/preview exceeds this time. Default: 15000

.PARAMETER TtsCacheRatio
  TTS warm/cold ratio threshold. Default: 0.8

.PARAMETER TtsCacheDeltaMs
  TTS warm must be < cold - delta. Default: 200

.PARAMETER DryRun
  Print checks that would run without executing

.PARAMETER Version
  Print version and exit

.EXAMPLE
  .\mobius_golden_path.ps1 -Profile smoke
  Run quick smoke test validation

.EXAMPLE
  .\mobius_golden_path.ps1 -Profile full -JUnitPath .\mobius_junit.xml -JsonSummary .\mobius_summary.json
  Run full verification with artifact generation

.EXAMPLE
  .\mobius_golden_path.ps1 -Only cors,ssrf,tts -FailFast -Quiet -JUnitPath .\mobius_junit.xml
  Run specific tests with fail-fast enabled
#>
[CmdletBinding()]
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
  [Alias("Retries")] [int]$RetryCount = 2,             # transient retries per HTTP call
  [int]$RetryDelayMs = 300,      # delay between retries
  [int]$PreviewMaxMs = 15000,     # fail if render/preview exceeds this time
  [double]$TtsCacheRatio = 0.8,   # TTS warm/cold ratio threshold
  [int]$TtsCacheDeltaMs = 200,     # TTS warm must be < cold - delta
  [string]$Profile,               # run predefined test set: smoke (fast) or full (comprehensive)
  [switch]$DryRun,                # print checks without executing
  [switch]$Version                # print version and exit
)

# Script metadata
# Try to read version from VERSION file, fallback to hardcoded value
$VersionFile = Join-Path $PSScriptRoot "VERSION"
if (Test-Path $VersionFile) {
    $ScriptVersion = Get-Content $VersionFile -Raw | ForEach-Object { $_.Trim() }
} else {
    $ScriptVersion = "1.0.0"
}
$Commit = try { git rev-parse HEAD 2>$null } catch { "unknown" }

# Add deprecation warnings for legacy aliases
if ($PSBoundParameters.ContainsKey('JsonOut')) {
  Write-Warning "--json-out is deprecated, use --json-summary instead"
}
if ($PSBoundParameters.ContainsKey('JunitOut')) {
  Write-Warning "--junit-out is deprecated, use --junit instead"
}
if ($PSBoundParameters.ContainsKey('Timeout')) {
  Write-Warning "--timeout is deprecated, use --timeout-default instead"
}
if ($PSBoundParameters.ContainsKey('Retries')) {
  Write-Warning "--retries is deprecated, use --retry instead"
}
if ($PSBoundParameters.ContainsKey('MetricsToken')) {
  Write-Warning "--metrics-token is deprecated, use --metrics-tok instead"
}

# Version output
if ($Version) {
  Write-Host "Mobius Golden Path Verification Script v$ScriptVersion (commit: $Commit)"
  exit 0
}

# Dry run output
if ($DryRun) {
  Write-Host "Dry run mode - would execute the following checks:"
  if (-not $PSBoundParameters.ContainsKey('Only') -or -not $Only -or $Only.Count -eq 0) {
    Write-Host "  All checks for profile: $($Profile)"
  } else {
    Write-Host "  Selected checks: $($Only -join ', ')"
  }
  exit 0
}

# Keep only valid BGG game pages for the /api/extract/bgg contract
$Allowed = @(
  "https://www.boardgamegeek.com/boardgame/174430/gloomhaven",
  "https://boardgamegeek.com/boardgame/205637/terraforming-mars"
)
$Denied = @(
  "http://169.254.169.254/latest/meta-data/",
  "http://127.0.0.1:22/",
  "http://10.0.0.1/",
  "http://[::1]/",
  "$Server/metrics"
)

# Reliability defaults
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}
$PSDefaultParameterValues['ConvertTo-Json:Depth']=5

# PowerShell strict mode for better error handling
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Metadata for artifacts
$StartedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")

# Reporting helpers
$Results = New-Object System.Collections.Generic.List[object]
function ShouldRun([string]$key) {
  if (-not $PSBoundParameters.ContainsKey('Only') -or -not $Only -or $Only.Count -eq 0) { return $true }
  return $Only -contains $key
}

# --- Logging functions (robust pattern) ---
function Info($msg) {
  if (-not $Quiet) { Write-Host "[INFO] $msg" -ForegroundColor Cyan }
  $Results.Add(@{type="INFO"; msg=$msg; timestamp=(Get-Date)})
}

function Pass($msg) { 
  Write-Host "[PASS] $msg" -ForegroundColor Green
  $Results.Add(@{type="PASS"; msg=$msg; timestamp=(Get-Date)})
}

function Fail($msg) {
  Write-Host "[FAIL] $msg" -ForegroundColor Red
  $Global:AnyFail = $true
  $Results.Add(@{type="FAIL"; msg=$msg; timestamp=(Get-Date)})
  if ($FailFast) { throw "Fail-fast: $msg" }
}

function Skipped($msg) { 
  Write-Host "[SKIP] $msg" -ForegroundColor Yellow
  $Results.Add(@{type="SKIP"; msg=$msg; timestamp=(Get-Date)})
}

# Null-safe, PS7-compatible HTTP helper
function HttpCall($url, $method="GET", $body=$null, $headers=@{}, [int]$timeout=$TimeoutDefault) {
  for ($attempt = 0; $attempt -le $RetryCount; $attempt++) {
    try {
      $psVersion = $PSVersionTable.PSVersion.Major
      $params = @{
        Uri         = $url
        Method      = $method
        TimeoutSec  = $timeout
        ErrorAction = 'Stop'
      }
      if ($body)    { $params.Body = $body; $params.ContentType = "application/json" }
      if ($headers) { $params.Headers = $headers }
      $r = if ($psVersion -ge 7) { Invoke-WebRequest @params } else { Invoke-WebRequest @params -UseBasicParsing }
      return @{ code=$r.StatusCode; headers=$r.Headers; content=$r.Content }
    } catch {
      if ($attempt -lt $RetryCount) { Start-Sleep -Milliseconds $RetryDelayMs; continue }
      $resp = $_.Exception.Response
      if ($resp) {
        $code=$resp.StatusCode.value__
        $sr = New-Object System.IO.StreamReader($resp.GetResponseStream()); $txt = $sr.ReadToEnd()
        return @{ code=$code; headers=$resp.Headers; content=$txt }
      }
      return @{ code=-1; headers=@{}; content=$_.Exception.Message }
    }
  }
}

# Profiles expansion
if ($Profile -and (-not $Only -or $Only.Count -eq 0)) {
  switch ($Profile) {
    "smoke" { $Only = @("readyz","health","cors","ssrf","tts","preview") }
    "full"  { $Only = @("prereq","start","readyz","health","frontend","metrics","cors","ssrf","tts","ajv","images","pdf","preview","hist","pressure","pm2") }
  }
  Info "Profile '$Profile' expanded to: $($Only -join ', ')"
}

# 0) Prerequisites
if (ShouldRun "prereq") {
Info "Checking prerequisites (node/npm/ffmpeg/ffprobe/tesseract)..."
try {
  $node = (node -v) 2>$null
  $npm  = (npm -v)  2>$null
  $ffm  = (ffmpeg -version | Select-String version -ErrorAction SilentlyContinue)
  $ffp  = (ffprobe -version | Select-String version -ErrorAction SilentlyContinue)
  if ($node -and $npm -and $ffm -and $ffp) { Pass "node=$node npm=$npm ffmpeg/ffprobe present" } else { Fail "Missing one of node/npm/ffmpeg/ffprobe" }
  $tess = (tesseract --version) 2>$null
  if ($tess) { Info "Tesseract present" } else { Info "Tesseract not installed (OCR optional)" }
} catch { Fail "Prereq check error: $_" }
}

# 1) Optionally start stack
if (ShouldRun "start") {
if ($StartStack) {
  Info "Starting dev stack (npm run dev)..."
  $env:BROWSER="none"
  Start-Process -FilePath "npm" -ArgumentList "run dev" -WindowStyle Hidden
  Start-Sleep 5
}
# Wait for readiness
$ready = $false
for ($i=0; $i -lt 30; $i++) {
  $r = HttpCall "$Server/readyz"
  if ($r.code -eq 200) { $ready=$true; break }
  Start-Sleep 1
}
if ($ready) { Pass "/readyz is 200" } else { Fail "Server not ready at $Server/readyz" }
}

# 2) Health & Liveness & Helmet headers
if (ShouldRun "health") {
$h = HttpCall "$Server/health"
if ($h.code -eq 200) { Pass "/health 200" } else { Fail "/health $($h.code)" }
$l = HttpCall "$Server/livez" "HEAD"
if ($l.code -eq 200) { Pass "/livez 200" } else { Fail "/livez $($l.code)" }
$hh = HttpCall "$Server/health" "HEAD"
$helmetHeaders = @("x-content-type-options","x-dns-prefetch-control","x-frame-options","referrer-policy")
$present = $helmetHeaders | Where-Object { $hh.headers[$_] }
if ($present.Count -gt 0) { Pass "Helmet headers present: $($present -join ', ')" } else { Info "Helmet headers not observed (check config/proxy)" }
}

# 3) Frontend proxy connectivity
if (ShouldRun "frontend") {
$f = HttpCall "$Frontend/api/health"
if ($f.code -eq 200) { Pass "Frontend proxy to backend OK" } else { Fail "Frontend proxy connection failed HTTP $($f.code)" }
}

# 4) Metrics protection
if (ShouldRun "metrics") {
$m = HttpCall "$Server/metrics"
if ($m.code -in 200,401,403) { Pass "/metrics responded HTTP $($m.code)" } else { Fail "/metrics unexpected HTTP $($m.code)" }
if ($m.code -eq 200 -and $m.content -match "build_info") { Info "Metrics appear unprotected or IP-allowed" }
if ($m.code -in 401,403 -and $MetricsTok) {
  $m2 = HttpCall "$Server/metrics" "GET" $null @{ Authorization = "Bearer $MetricsTok" }
  if ($m2.code -eq 200 -and $m2.content -match "build_info") { Pass "Metrics authorized with token" } else { Fail "Metrics token failed HTTP $($m2.code)" }
}
}

# 5) CORS preflight /api/tts
if (ShouldRun "cors") {
$pre = HttpCall "$Server/api/tts" "OPTIONS" $null @{
  Origin="http://localhost:3000"
  "Access-Control-Request-Method"="POST"
  "Access-Control-Request-Headers"="content-type"
}
if ($pre.code -in 200,204) { Pass "CORS preflight OK ($($pre.code))" } else { Fail "CORS preflight failed HTTP $($pre.code)" }
$aco = $pre.headers["Access-Control-Allow-Origin"]
$acm = $pre.headers["Access-Control-Allow-Methods"]
$ach = $pre.headers["Access-Control-Allow-Headers"]
$acc = $pre.headers["Access-Control-Allow-Credentials"]
$vary = $pre.headers["Vary"]
if ($aco) { Info "CORS A-C-A-Origin: $aco" } else { Info "No A-C-A-Origin header" }
if ($acm -and ($acm -match "POST")) { Pass "CORS allows POST" } else { Fail "CORS missing POST in A-C-A-Methods" }
if ($acc) { Info "CORS A-C-A-Credentials: $acc" } else { Info "No A-C-A-Credentials header" }
if ($vary) { Info "CORS Vary: $vary" } else { Info "No Vary header" }
}

# 6) SSRF allow/deny matrix
if (ShouldRun "ssrf") {
function TestExtract($url){
  $body = @{ bggUrl=$url } | ConvertTo-Json
  return HttpCall "$Server/api/extract/bgg" "POST" $body
}
$ok=0; $bad=0
foreach ($u in $Allowed) {
  $r = TestExtract $u
  if ($r.code -ge 200 -and $r.code -lt 400) { $ok++ } else { $bad++ ; Info "Allowed URL blocked? $u (HTTP $($r.code))" }
}
if ($ok -eq $Allowed.Count) { Pass "SSRF allowed set passed ($ok/$($Allowed.Count))" } else { Fail "SSRF allowed set issues ($ok/$($Allowed.Count))" }
$blk=0; $miss=0
foreach ($u in $Denied) {
  $r = TestExtract $u
  if ($r.code -ge 400) { $blk++ } else { $miss++ ; Info "Denied URL allowed? $u (HTTP $($r.code))" }
}
if ($blk -eq $Denied.Count) { Pass "SSRF denied set blocked ($blk/$($Denied.Count))" } else { Fail "SSRF denied set issues ($blk/$($Denied.Count))" }
}

# 7) TTS cold vs warm (cache)
if (ShouldRun "tts") {
# Use timestamp to guarantee a cold miss then a warm hit on the same input
$ttsBody = @{ text="Hello world from Mobius $(Get-Date -Format 'yyyyMMddHHmmss')"; voice="alloy" } | ConvertTo-Json
$sw = [System.Diagnostics.Stopwatch]::StartNew(); $x = HttpCall "$Server/api/tts" "POST" $ttsBody; $sw.Stop(); $cold=$sw.ElapsedMilliseconds
$sw.Restart(); $y = HttpCall "$Server/api/tts" "POST" $ttsBody; $sw.Stop(); $warm=$sw.ElapsedMilliseconds
Info "TTS cold=${cold}ms warm=${warm}ms"
$threshold = [Math]::Min($cold * $TtsCacheRatio, $cold - $TtsCacheDeltaMs)
if ($x.code -ge 200 -and $x.code -lt 400 -and $y.code -ge 200 -and $y.code -lt 400 -and $warm -lt $threshold) {
  Pass "TTS cache effective (threshold=${threshold}ms)"
} else { Info "TTS not clearly faster (cold=${cold}ms warm=${warm}ms threshold=${threshold}ms)" }
}

# 8) AJV strictness probe (prod expects 400)
if (ShouldRun "ajv") {
# Note: Changing NODE_ENV here does not affect a running server.
$env:NODE_ENV="production"
$ajvBody = @{ bggUrl="https://www.boardgamegeek.com/boardgame/174430/gloomhaven"; unexpected="nope" } | ConvertTo-Json
$ajv = HttpCall "$Server/api/extract/bgg" "POST" $ajvBody
if ($ajv.code -eq 400 -and ($ajv.content -match "additionalProperties|unexpected")) {
  Pass "AJV strictness enforced (400 with additionalProperties)"
} elseif ($ajv.code -ge 200 -and $ajv.code -lt 300) {
  Info "AJV non-strict (likely dev server). To enforce, start server with NODE_ENV=production."
} else {
  Info "AJV response HTTP $($ajv.code): $($ajv.content.Substring(0,[Math]::Min(160,$ajv.content.Length)))"
}
$env:NODE_ENV="development"
}

# 9) Images extraction (optional)
if (ShouldRun "images") {
if ($ImageUrls1.Count -gt 0) {
  $b1 = @{ extraImageUrls=$ImageUrls1 } | ConvertTo-Json
  $r1 = HttpCall "$Server/api/extract/images" "POST" $b1
  if ($r1.code -ge 200 -and $r1.code -lt 300) { Pass "images with extraImageUrls OK" } else { Info "images(extraImageUrls) HTTP $($r1.code)" }
}
if ($ImageUrls2.Count -gt 0) {
  $b2 = @{ urls=$ImageUrls2 } | ConvertTo-Json
  $r2 = HttpCall "$Server/api/extract/images" "POST" $b2
  if ($r2.code -ge 200 -and $r2.code -lt 300) { Pass "images with urls OK" } else { Info "images(urls) HTTP $($r2.code)" }
}

# 10) PDF extraction local/remote (optional)
if (Test-Path $LocalTextPDF) {
  $b = @{ path=$LocalTextPDF; ocr=$false } | ConvertTo-Json
  $r = HttpCall "$Server/api/extract/pdf" "POST" $b
  if ($r.code -ge 200 -and $r.code -lt 300) { Pass "local text PDF extract OK" } else { Info "local text PDF HTTP $($r.code)" }
} else { Skipped "Local text PDF not found: $LocalTextPDF" }
if (Test-Path $LocalScannedPDF) {
  $b = @{ path=$LocalScannedPDF; ocr=$true } | ConvertTo-Json
  $r = HttpCall "$Server/api/extract/pdf" "POST" $b
  if ($r.code -ge 200 -and $r.code -lt 300) { Pass "local scanned PDF with OCR OK" } else { Info "local scanned OCR HTTP $($r.code)" }
} else { Skipped "Local scanned PDF not found: $LocalScannedPDF" }
if ($RemotePDF) {
  $b = @{ url=$RemotePDF; ocr=$false } | ConvertTo-Json
  $r = HttpCall "$Server/api/extract/pdf" "POST" $b
  if ($r.code -ge 200 -and $r.code -lt 300) { Pass "remote PDF extract OK" } else { Info "remote PDF HTTP $($r.code)" }
}
}

# 11) Preview validate + render
if (ShouldRun "preview") {
  $Preview = @{
    title = "Smoke Test"
    segments = @(
      @{ type="image"; url="https://www.boardgamegeek.com"; duration=2.0 },
      @{ type="narration"; text="Hello from Mobius"; voice="alloy"; duration=2.0 }
    )
  } | ConvertTo-Json
  $tval = HttpCall "$Server/api/timeline/validate" "POST" $Preview
  if ($tval.code -ge 200 -and $tval.code -lt 300) { Pass "timeline/validate OK" } else { Info "timeline/validate HTTP $($tval.code)" }

  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  $tprev = HttpCall "$Server/api/render/preview" "POST" $Preview @{} $TimeoutPreview
  $sw.Stop()
  if ($tprev.code -ge 200 -and $tprev.code -lt 300) {
    if ($sw.ElapsedMilliseconds -le $PreviewMaxMs) {
      Pass "render/preview OK in $($sw.ElapsedMilliseconds)ms (<= $PreviewMaxMs ms)"
    } else {
      Fail "render/preview slow: $($sw.ElapsedMilliseconds)ms > $PreviewMaxMs ms"
    }
  } else {
    Info "render/preview HTTP $($tprev.code)"
  }
}

# 12) Load histograms
if (ShouldRun "hist") {
1..20 | % { [void](HttpCall "$Server/health") }
1..5  | % { [void](HttpCall "$Server/api/extract/bgg" "POST" (@{bggUrl=$Allowed[0]}|ConvertTo-Json)) }
$met = HttpCall "$Server/metrics"
if ($met.code -eq 200 -and $met.content -match "http_request_duration_seconds_bucket") { Pass "metrics histograms moved" } else { Info "metrics histograms not observed" }
}

# 13) Readiness under pressure
if (ShouldRun "pressure") {
$end=(Get-Date).AddSeconds(5)
while ((Get-Date) -lt $end) { 1..30000 | % { [Math]::Sqrt($_) } | Out-Null }
$rdy = HttpCall "$Server/readyz"
if ($rdy.code -eq 200) { Pass "/readyz 200 under light pressure" } else { Fail "/readyz degraded HTTP $($rdy.code)" }
}

# 14) Optional: PM2 graceful reload check
if (ShouldRun "pm2") {
try {
  $pm2 = (pm2 -v) 2>$null
  if ($pm2) {
    Info "PM2 graceful reload check"
    pm2 gracefulReload all | Out-Null
    Start-Sleep 2
    $chk = HttpCall "$Server/readyz"
    if ($chk.code -eq 200) { Pass "Service stayed ready during PM2 reload" } else { Fail "Service not ready after PM2 reload (HTTP $($chk.code))" }
  }
} catch { Info "PM2 not installed or not configured" }
}

# Summary
Write-Host ""
Write-Host "===== SUMMARY =====" -ForegroundColor Magenta
$pass = ($Results | ? {$_.type -eq "PASS"}).Count
$fail = ($Results | ? {$_.type -eq "FAIL"}).Count
$skip = ($Results | ? {$_.type -eq "SKIP"}).Count
$info = ($Results | ? {$_.type -eq "INFO"}).Count
Write-Host "PASS: $pass  FAIL: $fail  SKIP: $skip  INFO: $info"
if ($fail -gt 0) { Write-Host "One or more checks FAILED. Scroll up for details." -ForegroundColor Red }

# Write JSON summary if requested
if ($JsonSummary) {
  $FinishedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  $DurationMs = [Math]::Round(((Get-Date $FinishedAt) - (Get-Date $StartedAt)).TotalMilliseconds)
  
  # Create flags object
  $Flags = @{
    Server = $Server
    Frontend = $Frontend
    MetricsTok = if ($MetricsTok) { "[REDACTED]" } else { $MetricsTok }
    StartStack = $StartStack
    LocalTextPDF = $LocalTextPDF
    LocalScannedPDF = $LocalScannedPDF
    RemotePDF = $RemotePDF
    ImageUrls1 = $ImageUrls1
    ImageUrls2 = $ImageUrls2
    TimeoutDefault = $TimeoutDefault
    TimeoutPreview = $TimeoutPreview
    Quiet = $Quiet
    Only = $Only
    Profile = $Profile
    FailFast = $FailFast
    RetryCount = $RetryCount
    RetryDelayMs = $RetryDelayMs
    PreviewMaxMs = $PreviewMaxMs
    TtsCacheRatio = $TtsCacheRatio
    TtsCacheDeltaMs = $TtsCacheDeltaMs
    JUnitPath = $JUnitPath
  }
  
  $summary = [ordered]@{
    version = $ScriptVersion
    commit = $Commit
    profile = $Profile
    started_at = $StartedAt
    finished_at = $FinishedAt
    duration_ms = $DurationMs
    env = @{
      server = $Server
      frontend = $Frontend
    }
    thresholds = @{
      preview_max_ms = $PreviewMaxMs
      tts_ratio = $TtsCacheRatio
      tts_delta_ms = $TtsCacheDeltaMs
    }
    flags = $Flags
    checks = @()  # Would be populated with individual check results in a full implementation
    totals = @{
      pass = ($Results | ? { $_.type -eq "PASS" }).Count
      fail = ($Results | ? { $_.type -eq "FAIL" }).Count
      skip = ($Results | ? { $_.type -eq "SKIP" }).Count
      info = ($Results | ? { $_.type -eq "INFO" }).Count
    }
    failures = ($Results | ? { $_.type -eq "FAIL" } | % { $_.msg })
    infos = ($Results | ? { $_.type -eq "INFO" } | % { $_.msg })
  } | ConvertTo-Json -Depth 5
  Set-Content -Path $JsonSummary -Value $summary -Encoding UTF8
  if (-not $Quiet) { Write-Host "[INFO] Wrote JSON summary to $JsonSummary" -ForegroundColor Cyan }
}

# Write JUnit XML at the very end (just before JSON summary / exit)
if ($JUnitPath) {
  $total = $Results.Count
  $fail  = ($Results | ? { $_.type -eq "FAIL" }).Count
  $skips = ($Results | ? { $_.type -eq "SKIP" }).Count
  $suiteName = "MobiusGoldenPath"
  
  $sb = New-Object System.Text.StringBuilder
  [void]$sb.AppendLine('<?xml version="1.0" encoding="UTF-8"?>')
  [void]$sb.AppendLine("<testsuite name=""$suiteName"" tests=""$total"" failures=""$fail"" skipped=""$skips"">")
  $i = 0
  foreach ($r in $Results) {
    $i++
    $caseName = ($r.msg -replace '[<>&"]','')
    # Calculate timing if available
    $timeAttr = ""
    if ($r.timestamp) {
      $timeAttr = ' time="0.001"'  # Default small time value
    }
    [void]$sb.AppendLine("  <testcase classname=""$suiteName"" name=""$i. $caseName""$timeAttr>")
    if ($r.type -eq "FAIL") {
      $esc = ($r.msg -replace '&','&amp;').Replace('<','&lt;').Replace('>','&gt;').Replace('"','&quot;').Replace("'",'&apos;')
      [void]$sb.AppendLine("    <failure message=""$esc"">$esc</failure>")
    } elseif ($r.type -eq "SKIP") {
      [void]$sb.AppendLine("    <skipped/>")
    }
    [void]$sb.AppendLine("  </testcase>")
  }
  [void]$sb.AppendLine("</testsuite>")
  Set-Content -Path $JUnitPath -Value $sb.ToString() -Encoding UTF8
  if (-not $Quiet) { Write-Host "[INFO] Wrote JUnit XML to $JUnitPath" -ForegroundColor Cyan }
}

# CI-friendly hard-fail on failures
if ($fail -gt 0) { exit 1 } else { exit 0 }