#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Restore files from quarantine back to workspace.

.DESCRIPTION
    Moves files from a quarantine session back to their original locations.

.PARAMETER QuarantineSession
    Timestamp of the quarantine session to restore (e.g., "20250120_143000").

.PARAMETER QuarantinePath
    Base path for quarantine. Defaults to quarantine/artifacts/

.PARAMETER Confirm
    Actually perform the restore. Without this flag, runs in dry-run mode.

.EXAMPLE
    .\restore-from-quarantine.ps1 -QuarantineSession "20250120_143000"
    .\restore-from-quarantine.ps1 -QuarantineSession "20250120_143000" -Confirm
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)]
    [string]$QuarantineSession,
    
    [string]$QuarantinePath = "quarantine/artifacts",
    
    [switch]$Confirm
)

$ErrorActionPreference = "Stop"

$sessionDir = Join-Path $QuarantinePath $QuarantineSession

if (-not (Test-Path $sessionDir)) {
    Write-Error "Quarantine session not found: $sessionDir"
    exit 1
}

if (-not $Confirm) {
    Write-Host "=== DRY RUN MODE ===" -ForegroundColor Yellow
    Write-Host "Run with -Confirm to actually restore files" -ForegroundColor Yellow
    Write-Host ""
}

# Find all files in quarantine session
$quarantinedFiles = Get-ChildItem -Path $sessionDir -Recurse -File | Where-Object { $_.Name -ne "MANIFEST.txt" }

Write-Host "Found $($quarantinedFiles.Count) files to restore" -ForegroundColor Cyan
Write-Host ""

if ($quarantinedFiles.Count -eq 0) {
    Write-Host "No files to restore." -ForegroundColor Green
    exit 0
}

# Show what will be restored
Write-Host "Files to restore:" -ForegroundColor Yellow
foreach ($file in $quarantinedFiles) {
    $relativePath = $file.FullName.Substring($sessionDir.Length + 1)
    Write-Host "  $relativePath"
}
Write-Host ""

if (-not $Confirm) {
    Write-Host "This was a dry run. Use -Confirm to actually restore files." -ForegroundColor Yellow
    exit 0
}

# Actually restore files
Write-Host "Restoring files..." -ForegroundColor Cyan

$restoredCount = 0
$failedCount = 0

foreach ($file in $quarantinedFiles) {
    try {
        # Calculate original path
        $relativePath = $file.FullName.Substring($sessionDir.Length + 1)
        $targetPath = $relativePath
        $targetDir = Split-Path $targetPath -Parent
        
        # Create target directory if needed
        if ($targetDir -and -not (Test-Path $targetDir)) {
            New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
        }
        
        # Check if file already exists
        if (Test-Path $targetPath) {
            Write-Warning "File already exists, skipping: $targetPath"
            continue
        }
        
        # Move file back
        Move-Item -Path $file.FullName -Destination $targetPath -Force
        $restoredCount++
    } catch {
        Write-Warning "Failed to restore $relativePath : $_"
        $failedCount++
    }
}

Write-Host "`nRestore complete!" -ForegroundColor Green
Write-Host "  Restored: $restoredCount files" -ForegroundColor Green
Write-Host "  Failed: $failedCount files" -ForegroundColor $(if ($failedCount -gt 0) { "Red" } else { "Green" })
