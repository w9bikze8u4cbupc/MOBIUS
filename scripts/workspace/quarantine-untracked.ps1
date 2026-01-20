#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Quarantine untracked generated artifacts to clean up workspace.

.DESCRIPTION
    Moves clearly-generated artifacts (logs, outputs, data files) from the workspace
    into a quarantine directory. Never touches tracked files. Defaults to dry-run mode.

.PARAMETER Confirm
    Actually perform the move operations. Without this flag, runs in dry-run mode.

.PARAMETER QuarantinePath
    Base path for quarantine. Defaults to quarantine/artifacts/

.PARAMETER SnapshotFirst
    Create a snapshot before quarantining (recommended).

.EXAMPLE
    .\quarantine-untracked.ps1
    .\quarantine-untracked.ps1 -Confirm -SnapshotFirst
#>

[CmdletBinding()]
param(
    [switch]$Confirm,
    [string]$QuarantinePath = "quarantine/artifacts",
    [switch]$SnapshotFirst
)

$ErrorActionPreference = "Stop"

# Snapshot first if requested
if ($SnapshotFirst) {
    Write-Host "Creating safety snapshot first..." -ForegroundColor Cyan
    & (Join-Path $PSScriptRoot "snapshot-local-state.ps1")
    Write-Host ""
}

# Generate timestamp for this quarantine session
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$quarantineDir = Join-Path $QuarantinePath $timestamp

if (-not $Confirm) {
    Write-Host "=== DRY RUN MODE ===" -ForegroundColor Yellow
    Write-Host "Run with -Confirm to actually move files" -ForegroundColor Yellow
    Write-Host ""
}

# Get all untracked files
$untrackedFiles = git ls-files --others --exclude-standard

# Define patterns for clearly-generated artifacts (conservative)
# Only auto-quarantine obvious artifacts; leave potential source/config alone
$artifactPatterns = @(
    # Zip archives (logs, backups)
    '\.zip$',
    
    # Test data files
    '^data/test-.*\.txt$',
    '^data/test_.*\.txt$',
    
    # Ad-hoc test scripts (root level only)
    '^test-.*\.js$',
    '^check-db\.js$',
    '^run-batch2-.*\.js$',
    
    # Backup files
    '\.bak$',
    
    # Validation artifacts
    '^validation/.*/artifacts/.*',
    
    # Branch verification scripts (ad-hoc)
    '^verify-test-branches\.(ps1|sh)$',
    
    # Logs (if untracked)
    '\.log$',
    'logs/.*\.log$',
    'validation/.*/logs/.*',
    'stabilization-logs/.*',
    'branch-protection\.logs/.*',
    
    # Data outputs (if untracked)
    'data/output/.*',
    'data/exports/.*',
    'data/previews/.*',
    'data/uploads/.*\.(pdf|txt|wav|mp3)$',
    'data/projects\.db$',
    'data/cache/.*',
    
    # Build outputs (if untracked)
    'coverage/.*',
    'dist/.*',
    'out/.*',
    'build/.*',
    '\.cache/.*',
    
    # Generated media (if untracked)
    '.*\.mp3$',
    '.*\.mp4$',
    '.*\.wav$',
    'output\.mp4$',
    'trimmed_audio\.mp3$',
    'dynaudnorm_test\.wav$',
    'test_audio\.(mp3|wav)$',
    
    # Test PDFs (if untracked)
    'test-.*\.pdf$',
    'empty-fixture\.pdf$',
    'broken-test\.pdf$',
    'tmp/.*',
    'temp/.*',
    
    # Training data and large binaries (if untracked)
    '.*\.traineddata$',
    'lychee\.zip$',
    
    # Dependencies (if untracked)
    'node_modules/.*',
    'ffmpeg/.*',
    'ffmpeg-bin/.*',
    '__pycache__/.*',
    
    # Specific known generated files (if untracked)
    'server\.log$',
    'ui_output\.log$',
    'security-cleanup\.log$',
    'macos_golden\.log$',
    'root_md_files\.txt$',
    'PR_URLS\.txt$'
)

# Define patterns for files that should NEVER be auto-quarantined
# These are likely source/config files that need manual review
$protectedPatterns = @(
    # Client config and source
    '^client/postcss\.config\.js$',
    '^client/tailwind\.config\.js$',
    '^client/src/.*\.css$',
    '^client/src/ErrorBoundary\.js$',
    '^client/public/favicon\.ico$',
    
    # Server API endpoints
    '^src/api/.*\.js$',
    
    # UI components
    '^src/ui/.*\.jsx$',
    
    # Scripts (launcher and utilities)
    '^scripts/launch-mobius\.bat$',
    '^scripts/update-desktop-shortcut-icon\.ps1$',
    '^scripts/test_backend_expansion\.ps1$',
    '^scripts/test_endpoints\.(ps1|sh)$',
    
    # Validation scripts
    '^validation/scripts/.*\.(ps1|sh)$'
)

# Classify files
$toQuarantine = @()
$toReview = @()

foreach ($file in $untrackedFiles) {
    # Check if file is protected (never auto-quarantine)
    $isProtected = $false
    foreach ($pattern in $protectedPatterns) {
        if ($file -match $pattern) {
            $isProtected = $true
            break
        }
    }
    
    if ($isProtected) {
        $toReview += $file
        continue
    }
    
    # Check if file matches artifact patterns
    $isArtifact = $false
    foreach ($pattern in $artifactPatterns) {
        if ($file -match $pattern) {
            $isArtifact = $true
            break
        }
    }
    
    if ($isArtifact) {
        $toQuarantine += $file
    } else {
        $toReview += $file
    }
}

Write-Host "Analysis complete:" -ForegroundColor Cyan
Write-Host "  Files to quarantine: $($toQuarantine.Count)" -ForegroundColor Yellow
Write-Host "  Files to review: $($toReview.Count)" -ForegroundColor Green
Write-Host ""

if ($toQuarantine.Count -eq 0) {
    Write-Host "No files to quarantine. Workspace is clean!" -ForegroundColor Green
    exit 0
}

# Show what will be moved
Write-Host "Files to quarantine:" -ForegroundColor Yellow
$toQuarantine | ForEach-Object { Write-Host "  $_" }
Write-Host ""

if ($toReview.Count -gt 0) {
    Write-Host "Files left for manual review:" -ForegroundColor Green
    $toReview | ForEach-Object { Write-Host "  $_" }
    Write-Host ""
}

if (-not $Confirm) {
    Write-Host "This was a dry run. Use -Confirm to actually move files." -ForegroundColor Yellow
    exit 0
}

# Actually move files
Write-Host "Moving files to quarantine..." -ForegroundColor Cyan
New-Item -ItemType Directory -Path $quarantineDir -Force | Out-Null

$movedCount = 0
$failedCount = 0

foreach ($file in $toQuarantine) {
    try {
        # Preserve directory structure
        $relativePath = $file
        $targetPath = Join-Path $quarantineDir $relativePath
        $targetDir = Split-Path $targetPath -Parent
        
        # Create target directory
        if (-not (Test-Path $targetDir)) {
            New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
        }
        
        # Move file
        Move-Item -Path $file -Destination $targetPath -Force
        $movedCount++
    } catch {
        Write-Warning "Failed to move $file : $_"
        $failedCount++
    }
}

# Create manifest
$manifest = @"
Quarantine Session: $timestamp
=====================================

Moved: $movedCount files
Failed: $failedCount files

Original locations preserved in directory structure.

To restore files:
  .\restore-from-quarantine.ps1 -QuarantineSession $timestamp

"@

$manifest | Out-File -FilePath (Join-Path $quarantineDir "MANIFEST.txt") -Encoding utf8

Write-Host "`nQuarantine complete!" -ForegroundColor Green
Write-Host "  Moved: $movedCount files" -ForegroundColor Green
Write-Host "  Failed: $failedCount files" -ForegroundColor $(if ($failedCount -gt 0) { "Red" } else { "Green" })
Write-Host "  Location: $quarantineDir" -ForegroundColor Cyan
