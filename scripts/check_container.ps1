param(
  [Parameter(Mandatory = $true)][string]$JsonPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (!(Test-Path -Path $JsonPath)) {
  Write-Error "Container report not found: $JsonPath"
  exit 2
}

$payload = Get-Content -Path $JsonPath -Raw | ConvertFrom-Json
$streams = @()
if ($null -ne $payload.streams) {
  $streams = $payload.streams
}

$video = $streams | Where-Object { $_.codec_type -eq 'video' } | Select-Object -First 1
if ($null -eq $video) {
  Write-Error 'No video stream detected in preview.'
  exit 4
}

if ($video.codec_name -and $video.codec_name -ne 'h264') {
  Write-Error "Expected h264 video codec but found $($video.codec_name)."
  exit 5
}

if ($video.pix_fmt -and $video.pix_fmt -ne 'yuv420p') {
  Write-Error "Expected yuv420p pixel format but found $($video.pix_fmt)."
  exit 6
}

$audio = $streams | Where-Object { $_.codec_type -eq 'audio' } | Select-Object -First 1
if ($null -eq $audio) {
  Write-Error 'No audio stream detected in preview.'
  exit 7
}

Write-Host "Preview container looks healthy (video=$($video.codec_name), audio=$($audio.codec_name))."
