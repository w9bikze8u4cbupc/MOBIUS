param(
    [string]$Game = "space-invaders",
    [string]$OS = "windows"
)

$debugDir = "tests/golden/$Game/$OS/debug"
$baselineDir = "tests/golden/$Game/$OS"

if (Test-Path $debugDir) {
    Get-ChildItem $debugDir -Filter 'actual_*' | ForEach-Object {
        $newName = $_.Name -replace '^actual_', ''
        Copy-Item $_.FullName "$baselineDir/$newName" -Force
        Write-Host "Promoted $($_.Name) to $baselineDir/$newName"
    }
    Write-Host "Baseline promotion complete for $Game on $OS"
} else {
    Write-Host "Debug directory not found: $debugDir"
}