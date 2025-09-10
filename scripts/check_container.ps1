param(
    [string]$JsonPath = "artifacts/preview_ffprobe.json"
)

# Check if file exists
if (-not (Test-Path $JsonPath)) {
    Write-Host "File not found: $JsonPath"
    exit 0
}

# Read and parse JSON
try {
    $json = Get-Content $JsonPath | ConvertFrom-Json
} catch {
    Write-Host "Failed to parse JSON file: $JsonPath"
    exit 0
}

# Extract video stream information
$videoStream = $json.streams | Where-Object { $_.codec_type -eq "video" }

if (-not $videoStream) {
    Write-Host "No video stream found in JSON"
    exit 1
}

# Check properties
$fail = 0

if ($videoStream.pix_fmt -ne "yuv420p") {
    Write-Host "pix_fmt != yuv420p ($($videoStream.pix_fmt))"
    $fail = 1
}

if ($videoStream.avg_frame_rate -ne "30/1") {
    Write-Host "avg_frame_rate != 30/1 ($($videoStream.avg_frame_rate))"
    $fail = 1
}

if ($videoStream.sample_aspect_ratio -ne "1:1") {
    Write-Host "sample_aspect_ratio != 1:1 ($($videoStream.sample_aspect_ratio))"
    $fail = 1
}

exit $fail