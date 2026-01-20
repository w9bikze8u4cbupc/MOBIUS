#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Generate a review report for commit-candidate files.

.DESCRIPTION
    Creates a detailed report of commit-candidate files including:
    - File paths and sizes
    - Last modified timestamps
    - Git diff output (if file exists)
    - Suggested staging commands (commented, not executed)
    
    This script performs NO git operations - it only generates a report.

.PARAMETER SnapshotPath
    Path to snapshot directory. Defaults to latest snapshot.

.PARAMETER OutputPath
    Base path for reports. Defaults to quarantine/reports/

.EXAMPLE
    .\review-commit-candidates.ps1
#>

[CmdletBinding()]
param(
    [string]$SnapshotPath,
    [string]$OutputPath = "quarantine/reports"
)

$ErrorActionPreference = "Stop"

Write-Host "Generating commit-candidates review report..." -ForegroundColor Cyan
Write-Host ""

# Run triage to get commit-candidates
$triageScript = Join-Path $PSScriptRoot "triage-untracked.ps1"
if (-not (Test-Path $triageScript)) {
    Write-Error "Triage script not found: $triageScript"
    exit 1
}

$triageParams = @{}
if ($SnapshotPath) {
    $triageParams['SnapshotPath'] = $SnapshotPath
}

$triageResult = & $triageScript @triageParams

$commitCandidates = $triageResult.CommitCandidates

if ($commitCandidates.Count -eq 0) {
    Write-Host "No commit-candidates found. Workspace is clean!" -ForegroundColor Green
    exit 0
}

Write-Host "Found $($commitCandidates.Count) commit-candidates" -ForegroundColor Yellow
Write-Host ""

# Generate timestamp
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$reportDir = $OutputPath
New-Item -ItemType Directory -Path $reportDir -Force | Out-Null

$reportPath = Join-Path $reportDir "commit-candidates-review-$timestamp.txt"

# Build report
$report = @"
Commit-Candidates Review Report
Generated: $timestamp
=====================================

SUMMARY
-------
Total commit-candidates: $($commitCandidates.Count)

These files appear to be legitimate source code or configuration files.
Review each file carefully before staging.

IMPORTANT: This report does NOT execute any git commands.
           Review the suggestions below and execute manually if appropriate.

FILES
-----

"@

foreach ($file in $commitCandidates) {
    $report += "`n"
    $report += "═══════════════════════════════════════════════════════════════`n"
    $report += "File: $file`n"
    $report += "═══════════════════════════════════════════════════════════════`n"
    
    if (Test-Path $file) {
        $fileInfo = Get-Item $file
        $report += "Size: $($fileInfo.Length) bytes`n"
        $report += "Last Modified: $($fileInfo.LastWriteTime)`n"
        $report += "`n"
        
        # Check if this is a new file or modified tracked file
        $gitStatus = git status --porcelain=v1 $file 2>$null
        if ($gitStatus) {
            $statusCode = $gitStatus.Substring(0, 2).Trim()
            if ($statusCode -eq "M" -or $statusCode -eq "MM") {
                $report += "Status: MODIFIED (tracked file with changes)`n"
                $report += "`nGit Diff:`n"
                $report += "---`n"
                try {
                    $diff = git diff -- $file 2>$null
                    if ($diff) {
                        $report += $diff -join "`n"
                    } else {
                        $report += "(no diff - changes may be staged)`n"
                    }
                } catch {
                    $report += "(unable to get diff)`n"
                }
                $report += "`n---`n"
            } else {
                $report += "Status: UNTRACKED (new file)`n"
            }
        } else {
            $report += "Status: UNTRACKED (new file)`n"
        }
        
        # Show first few lines for text files
        $extension = $fileInfo.Extension.ToLower()
        $textExtensions = @('.js', '.jsx', '.ts', '.tsx', '.json', '.css', '.html', '.md', '.txt', '.ps1', '.sh', '.bat')
        if ($textExtensions -contains $extension) {
            $report += "`nPreview (first 10 lines):`n"
            $report += "---`n"
            try {
                $preview = Get-Content $file -TotalCount 10 -ErrorAction SilentlyContinue
                if ($preview) {
                    $report += ($preview -join "`n")
                    $report += "`n"
                }
            } catch {
                $report += "(unable to preview)`n"
            }
            $report += "---`n"
        }
    } else {
        $report += "WARNING: File not found (may have been moved)`n"
    }
}

$report += @"

`n
SUGGESTED STAGING COMMANDS
---------------------------
Review the files above, then stage appropriate ones:

# Stage individual files after review:
"@

foreach ($file in $commitCandidates) {
    $report += "`ngit add $file"
}

$report += @"


# Or stage all commit-candidates at once (USE WITH CAUTION):
git add ``
"@

foreach ($file in $commitCandidates) {
    $report += "`n  $file ``"
}

$report += @"


# After staging, review what will be committed:
git status
git diff --cached

# Commit with descriptive message:
git commit -m "Add new source files and configuration"

WARNINGS
--------
- DO NOT commit unless you have reviewed each file
- DO NOT stage files you don't recognize
- DO NOT commit generated artifacts or test outputs
- Consider creating a separate PR for these changes

"@

# Write report
$report | Out-File -FilePath $reportPath -Encoding utf8

# Display summary
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "COMMIT-CANDIDATES REVIEW" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "Total files: $($commitCandidates.Count)" -ForegroundColor Yellow
Write-Host ""

foreach ($file in $commitCandidates) {
    if (Test-Path $file) {
        $fileInfo = Get-Item $file
        $sizeKB = [math]::Round($fileInfo.Length / 1KB, 2)
        Write-Host "  $file" -ForegroundColor White
        Write-Host "    Size: $sizeKB KB | Modified: $($fileInfo.LastWriteTime.ToString('yyyy-MM-dd HH:mm'))" -ForegroundColor Gray
    } else {
        Write-Host "  $file" -ForegroundColor White
        Write-Host "    (file not found)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "Full report saved to: $reportPath" -ForegroundColor Cyan
Write-Host ""
Write-Host "NEXT STEPS:" -ForegroundColor Yellow
Write-Host "1. Review the report file above" -ForegroundColor White
Write-Host "2. Examine each file individually" -ForegroundColor White
Write-Host "3. Stage appropriate files with: git add <file>" -ForegroundColor White
Write-Host "4. Review staged changes with: git diff --cached" -ForegroundColor White
Write-Host "5. Commit with descriptive message" -ForegroundColor White
Write-Host ""
Write-Host "WARNING: Do not commit without review!" -ForegroundColor Red
Write-Host ""

return @{
    CommitCandidates = $commitCandidates
    ReportPath = $reportPath
}
