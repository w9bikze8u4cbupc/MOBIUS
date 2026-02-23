# scripts/run-hephaestus.ps1
# Cross-platform launcher for HEPHAESTUS external workspace
# Handles Windows-specific quoting and path resolution

param(
    [Parameter(Mandatory=$true)]
    [string]$PdfPath,
    
    [Parameter(Mandatory=$true)]
    [string]$OutputDir,
    
    [string]$MinConfidence = "0.7",
    
    [string]$Workspace = $env:HEPHAESTUS_WORKSPACE,
    
    [string]$Cli = $env:HEPHAESTUS_CLI,
    
    [string]$Python = "python3"
)

# Validate inputs
if (-not (Test-Path $PdfPath)) {
    Write-Error "PDF not found: $PdfPath"
    exit 1
}

if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

# Resolve HEPHAESTUS execution method
if ($Cli -and (Test-Path $Cli)) {
    # Explicit CLI path
    Write-Host "Using explicit HEPHAESTUS CLI: $Cli"
    & $Cli extract --mode mobius $PdfPath --out $OutputDir --min-confidence $MinConfidence
    $exitCode = $LASTEXITCODE
} elseif ($Workspace -and (Test-Path $Workspace)) {
    # Python module mode
    Write-Host "Using HEPHAESTUS workspace: $Workspace"
    Push-Location $Workspace
    try {
        & $Python -m hephaestus extract --mode mobius $PdfPath --out $OutputDir --min-confidence $MinConfidence
        $exitCode = $LASTEXITCODE
    } finally {
        Pop-Location
    }
} else {
    Write-Error "HEPHAESTUS not configured. Set HEPHAESTUS_WORKSPACE or HEPHAESTUS_CLI"
    exit 1
}

# Validate MOBIUS_READY marker
$readyMarker = Join-Path $OutputDir "MOBIUS_READY\manifest.json"
if (-not (Test-Path $readyMarker)) {
    Write-Error "MOBIUS_READY marker not found at: $readyMarker"
    exit 1
}

Write-Host "✅ HEPHAESTUS extraction complete"
Write-Host "   MOBIUS_READY marker validated"
exit $exitCode
