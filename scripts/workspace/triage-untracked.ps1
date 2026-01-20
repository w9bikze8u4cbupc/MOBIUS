#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Triage untracked files into commit/quarantine/hold buckets.

.DESCRIPTION
    Analyzes untracked files and classifies them into three buckets:
    - Commit-candidates: Likely source/config files that should be reviewed for commit
    - Quarantine-candidates: Artifacts/logs/scratch files safe to move out
    - Hold-candidates: Docs/notes that can remain but shouldn't pollute root

.PARAMETER SnapshotPath
    Path to snapshot directory. Defaults to latest snapshot.

.PARAMETER OutputPath
    Base path for triage reports. Defaults to quarantine/reports/

.EXAMPLE
    .\triage-untracked.ps1
    .\triage-untracked.ps1 -SnapshotPath "quarantine/snapshots/20260120_063502"
#>

[CmdletBinding()]
param(
    [string]$SnapshotPath,
    [string]$OutputPath = "quarantine/reports"
)

$ErrorActionPreference = "Stop"

# Find latest snapshot if not specified
if (-not $SnapshotPath) {
    $snapshots = Get-ChildItem -Path "quarantine/snapshots" -Directory | Sort-Object Name -Descending
    if ($snapshots.Count -eq 0) {
        Write-Error "No snapshots found. Run snapshot-local-state.ps1 first."
        exit 1
    }
    $SnapshotPath = $snapshots[0].FullName
}

$untrackedFile = Join-Path $SnapshotPath "untracked-files.txt"
if (-not (Test-Path $untrackedFile)) {
    Write-Error "Untracked files list not found: $untrackedFile"
    exit 1
}

Write-Host "Analyzing untracked files from: $SnapshotPath" -ForegroundColor Cyan
Write-Host ""

# Read untracked files
$untrackedFiles = Get-Content $untrackedFile | Where-Object { $_ -ne "" }

# Define classification patterns
$commitPatterns = @(
    # Client config and source
    '^client/postcss\.config\.js$',
    '^client/tailwind\.config\.js$',
    '^client/src/.*\.css$',
    '^client/src/ErrorBoundary\.js$',
    '^client/public/favicon\.ico$',
    
    # Server API endpoints
    '^src/api/assets\.js$',
    '^src/api/projects\.js$',
    '^src/api/summarize\.js$',
    '^src/api/tts\.js$',
    
    # UI components
    '^src/ui/ErrorBoundary\.jsx$',
    
    # Scripts (launcher and utilities)
    '^scripts/launch-mobius\.bat$',
    '^scripts/update-desktop-shortcut-icon\.ps1$',
    '^scripts/test_backend_expansion\.ps1$',
    '^scripts/test_endpoints\.(ps1|sh)$',
    
    # Validation scripts (Windows-relevant)
    '^validation/scripts/verify-batch2\.(ps1|sh)$'
)

$quarantinePatterns = @(
    # Zip archives
    '\.zip$',
    
    # Test data files
    '^data/test-.*\.txt$',
    '^data/test_.*\.txt$',
    
    # Ad-hoc test scripts (root level)
    '^test-.*\.js$',
    '^check-db\.js$',
    '^run-batch2-.*\.js$',
    
    # Backup files
    '\.bak$',
    
    # Validation artifacts
    '^validation/.*/artifacts/.*',
    
    # Branch verification scripts (ad-hoc)
    '^verify-test-branches\.(ps1|sh)$'
)

$holdPatterns = @(
    # Root-level markdown docs (status/planning)
    '^[A-Z_-]+\.md$',
    
    # Validation tracker
    '^validation_tracker\.md$',
    
    # Phase/batch documentation
    '^phase_f_.*\.md$',
    
    # Validation batch documentation
    '^validation/batch2/.*\.md$',
    '^validation/batch2/.*\.json$',
    '^validation/batch2/.*\.js$',
    '^validation/issues/.*\.json$',
    
    # Validation tools backup
    '^validation/tools/.*\.bak$'
)

# Classify files
$commitCandidates = @()
$quarantineCandidates = @()
$holdCandidates = @()
$unclassified = @()

foreach ($file in $untrackedFiles) {
    $classified = $false
    
    # Check commit patterns first (highest priority)
    foreach ($pattern in $commitPatterns) {
        if ($file -match $pattern) {
            $commitCandidates += $file
            $classified = $true
            break
        }
    }
    
    if ($classified) { continue }
    
    # Check quarantine patterns
    foreach ($pattern in $quarantinePatterns) {
        if ($file -match $pattern) {
            $quarantineCandidates += $file
            $classified = $true
            break
        }
    }
    
    if ($classified) { continue }
    
    # Check hold patterns
    foreach ($pattern in $holdPatterns) {
        if ($file -match $pattern) {
            $holdCandidates += $file
            $classified = $true
            break
        }
    }
    
    if (-not $classified) {
        $unclassified += $file
    }
}

# Generate report
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$reportDir = $OutputPath
New-Item -ItemType Directory -Path $reportDir -Force | Out-Null

$reportPath = Join-Path $reportDir "untracked-triage-$timestamp.txt"

$report = @"
Untracked Files Triage Report
Generated: $timestamp
Source: $SnapshotPath
=====================================

SUMMARY
-------
Total untracked files: $($untrackedFiles.Count)
  Commit-candidates:     $($commitCandidates.Count)
  Quarantine-candidates: $($quarantineCandidates.Count)
  Hold-candidates:       $($holdCandidates.Count)
  Unclassified:          $($unclassified.Count)

COMMIT-CANDIDATES (Source/Config Files)
----------------------------------------
These files appear to be legitimate source code, configuration, or scripts
that should be reviewed and potentially committed to the repository.

"@

if ($commitCandidates.Count -gt 0) {
    $report += ($commitCandidates | ForEach-Object { "  $_" }) -join "`n"
} else {
    $report += "  (none)"
}

$report += @"

`n
QUARANTINE-CANDIDATES (Artifacts/Logs/Scratch)
-----------------------------------------------
These files appear to be generated artifacts, logs, or ad-hoc test files
that can be safely moved to quarantine.

"@

if ($quarantineCandidates.Count -gt 0) {
    $report += ($quarantineCandidates | ForEach-Object { "  $_" }) -join "`n"
} else {
    $report += "  (none)"
}

$report += @"

`n
HOLD-CANDIDATES (Documentation/Notes)
--------------------------------------
These files appear to be documentation, status reports, or planning notes.
They can remain in the workspace but may clutter the root directory.
Consider organizing into docs/ or quarantining if no longer needed.

"@

if ($holdCandidates.Count -gt 0) {
    $report += ($holdCandidates | ForEach-Object { "  $_" }) -join "`n"
} else {
    $report += "  (none)"
}

$report += @"

`n
UNCLASSIFIED
------------
These files did not match any classification pattern and require manual review.

"@

if ($unclassified.Count -gt 0) {
    $report += ($unclassified | ForEach-Object { "  $_" }) -join "`n"
} else {
    $report += "  (none)"
}

$report += @"

`n
NEXT STEPS
----------
1. Review commit-candidates and stage appropriate files:
   git add <file>

2. Run quarantine script to move artifacts (dry-run first):
   .\scripts\workspace\quarantine-untracked.ps1
   .\scripts\workspace\quarantine-untracked.ps1 -Confirm

3. Review hold-candidates and decide:
   - Keep in place if actively used
   - Move to docs/ if archival
   - Quarantine if obsolete

4. Manually review unclassified files

"@

# Write report
$report | Out-File -FilePath $reportPath -Encoding utf8

# Display summary
Write-Host "TRIAGE SUMMARY" -ForegroundColor Cyan
Write-Host "==============" -ForegroundColor Cyan
Write-Host ""
Write-Host "Total untracked files: $($untrackedFiles.Count)" -ForegroundColor White
Write-Host ""
Write-Host "  Commit-candidates:     $($commitCandidates.Count)" -ForegroundColor Green
Write-Host "  Quarantine-candidates: $($quarantineCandidates.Count)" -ForegroundColor Yellow
Write-Host "  Hold-candidates:       $($holdCandidates.Count)" -ForegroundColor Cyan
Write-Host "  Unclassified:          $($unclassified.Count)" -ForegroundColor Magenta
Write-Host ""

if ($commitCandidates.Count -gt 0) {
    Write-Host "Commit-candidates (source/config):" -ForegroundColor Green
    $commitCandidates | ForEach-Object { Write-Host "  $_" -ForegroundColor Green }
    Write-Host ""
}

if ($quarantineCandidates.Count -gt 0) {
    Write-Host "Quarantine-candidates (artifacts/scratch):" -ForegroundColor Yellow
    $quarantineCandidates | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
    Write-Host ""
}

Write-Host "Full report saved to: $reportPath" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next: Review commit-candidates and run quarantine script" -ForegroundColor White

return @{
    CommitCandidates = $commitCandidates
    QuarantineCandidates = $quarantineCandidates
    HoldCandidates = $holdCandidates
    Unclassified = $unclassified
    ReportPath = $reportPath
}
