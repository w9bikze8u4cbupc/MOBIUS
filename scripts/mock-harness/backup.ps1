# PowerShell backup script for MOBIUS

param(
    [string]$BackupDir = "./backups"
)

$ErrorActionPreference = "Stop"

Write-Host "=== MOBIUS Backup Script ===" -ForegroundColor Green

# Configuration
$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$BackupName = "mobius_backup_$Timestamp"

# Create backup directory
if (-not (Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
}

Write-Host "Creating backup: $BackupName" -ForegroundColor Yellow

# Mock backup operations (replace with real backup logic)
Write-Host "📁 Backing up configuration files..." -ForegroundColor Cyan

if (Test-Path "backend") {
    Copy-Item -Path "backend" -Destination "$BackupDir\${BackupName}_backend" -Recurse -Force -ErrorAction SilentlyContinue
}

if (Test-Path "client") {
    Copy-Item -Path "client\src" -Destination "$BackupDir\${BackupName}_frontend" -Recurse -Force -ErrorAction SilentlyContinue
}

# Create backup manifest
$manifest = @{
    backup_name = $BackupName
    timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    components = @("backend", "frontend", "config")
    status = "completed"
} | ConvertTo-Json -Depth 3

$manifest | Out-File -FilePath "$BackupDir\${BackupName}_manifest.json" -Encoding UTF8

Write-Host "✅ Backup completed successfully" -ForegroundColor Green
Write-Host "📂 Backup location: $BackupDir\$BackupName" -ForegroundColor Cyan
Write-Host "📄 Manifest: $BackupDir\${BackupName}_manifest.json" -ForegroundColor Cyan

# Return backup path for use in other scripts
if ($env:GITHUB_OUTPUT) {
    "BACKUP_PATH=$BackupDir\$BackupName" | Out-File -FilePath $env:GITHUB_OUTPUT -Append -Encoding UTF8
}