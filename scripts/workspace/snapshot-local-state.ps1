#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Snapshot current workspace state for safe quarantine operations.

.DESCRIPTION
    Creates a timestamped manifest of git status, diffs, and untracked files.
    Optionally creates a backup zip of untracked files.

.PARAMETER BackupUntracked
    If specified, creates a zip backup of all untracked files (can be large).

.PARAMETER OutputPath
    Base path for snapshots. Defaults to quarantine/snapshots/

.EXAMPLE
    .\snapshot-local-state.ps1
    .\snapshot-local-state.ps1 -BackupUntracked -OutputPath "C:\backups"
#>

[CmdletBinding()]
param(
    [switch]$BackupUntracked,
    [string]$OutputPath = "quarantine/snapshots"
)

$ErrorActionPreference = "Stop"

# Generate timestamp
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$snapshotDir = Join-Path $OutputPath $timestamp

Write-Host "Creating snapshot: $snapshotDir" -ForegroundColor Cyan

# Create snapshot directory
New-Item -ItemType Directory -Path $snapshotDir -Force | Out-Null

# Capture git status
Write-Host "Capturing git status..." -ForegroundColor Yellow
git status --porcelain=v1 | Out-File -FilePath (Join-Path $snapshotDir "git-status.txt") -Encoding utf8

# Capture git diff for tracked changes
Write-Host "Capturing git diff..." -ForegroundColor Yellow
git diff | Out-File -FilePath (Join-Path $snapshotDir "git-diff.txt") -Encoding utf8
git diff --cached | Out-File -FilePath (Join-Path $snapshotDir "git-diff-staged.txt") -Encoding utf8

# List all untracked files
Write-Host "Listing untracked files..." -ForegroundColor Yellow
$untrackedFiles = git ls-files --others --exclude-standard
$untrackedFiles | Out-File -FilePath (Join-Path $snapshotDir "untracked-files.txt") -Encoding utf8

# Count files by category
$untrackedCount = ($untrackedFiles | Measure-Object).Count
$modifiedCount = (git diff --name-only | Measure-Object).Count
$stagedCount = (git diff --cached --name-only | Measure-Object).Count

# Create summary
$summary = @"
Workspace Snapshot: $timestamp
=====================================

Modified (unstaged): $modifiedCount files
Staged: $stagedCount files
Untracked: $untrackedCount files

Branch: $(git branch --show-current)
Commit: $(git rev-parse HEAD)

Files:
- git-status.txt: Full porcelain status
- git-diff.txt: Unstaged changes
- git-diff-staged.txt: Staged changes
- untracked-files.txt: All untracked files
"@

if ($BackupUntracked -and $untrackedCount -gt 0) {
    Write-Host "Creating backup zip of untracked files (this may take a while)..." -ForegroundColor Yellow
    $zipPath = Join-Path $snapshotDir "untracked-backup.zip"
    
    # Create temp file list for 7z or Compress-Archive
    $fileListPath = Join-Path $snapshotDir "zip-filelist.txt"
    $untrackedFiles | Out-File -FilePath $fileListPath -Encoding utf8
    
    try {
        # Use Compress-Archive (built-in, but slower)
        $filesToZip = $untrackedFiles | ForEach-Object { Get-Item $_ -ErrorAction SilentlyContinue } | Where-Object { $_ -ne $null }
        if ($filesToZip) {
            Compress-Archive -Path $filesToZip -DestinationPath $zipPath -CompressionLevel Fastest
            $summary += "`n- untracked-backup.zip: Backup of all untracked files"
        }
    } catch {
        Write-Warning "Failed to create backup zip: $_"
        $summary += "`n- Backup zip creation failed (files listed in untracked-files.txt)"
    }
}

$summary | Out-File -FilePath (Join-Path $snapshotDir "SUMMARY.txt") -Encoding utf8

Write-Host "`nSnapshot complete!" -ForegroundColor Green
Write-Host "Location: $snapshotDir" -ForegroundColor Green
Write-Host "`nSummary:" -ForegroundColor Cyan
Write-Host $summary

return $snapshotDir
