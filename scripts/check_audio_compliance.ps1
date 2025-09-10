param(
    [Parameter(Mandatory=$true)]
    [string]$Ebur128LogPath
)

# Check if file exists
if (-not (Test-Path $Ebur128LogPath)) {
    Write-Host "Usage: check_audio_compliance.ps1 <ebur128_log.txt>"
    exit 2
}

# Read the file content
$text = Get-Content $Ebur128LogPath -Raw

# Extract Integrated (I), Loudness Range (LRA), and True Peak (TP)
$I = $null
$LRA = $null
$TP = $null

# Split text into lines and process each line
$lines = $text -split "`r?`n"
foreach ($line in $lines) {
    if ($null -eq $I) {
        if ($line -match '\bI:\s*(-?\d+(?:\.\d+)?)\s*LUFS\b') {
            $I = [double]$matches[1]
        }
    }
    if ($null -eq $LRA) {
        if ($line -match '\bLRA:\s*(\d+(?:\.\d+)?)\s*LU\b') {
            $LRA = [double]$matches[1]
        }
    }
    if ($null -eq $TP) {
        if ($line -match '\bTP:\s*(-?\d+(?:\.\d+)?)\s*dBFS\b') {
            $TP = [double]$matches[1]
        }
    }
}

# Create result object
$result = @{
    integrated_lufs = $I
    lra_lu = $LRA
    true_peak_dbfs = $TP
}

# Output result as JSON
$result | ConvertTo-Json

# Gates (adjust as desired)
$fail = $false
if ($null -eq $I -or $I -lt -17.0 -or $I -gt -15.0) {  # target -16 ±1 LU
    $fail = $true
}
if ($null -eq $LRA -or $LRA -gt 11.0) {
    $fail = $true
}
if ($null -eq $TP -or $TP -gt -1.0) {  # must be <= -1.0 dBFS
    $fail = $true
}

if ($fail) {
    exit 1
} else {
    exit 0
}