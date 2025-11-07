param(
  [Parameter(Mandatory = $true)][string]$ArtifactDir,
  [Parameter(Mandatory = $true)][string]$PreviewPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (!(Test-Path -Path $ArtifactDir)) {
  New-Item -ItemType Directory -Path $ArtifactDir | Out-Null
}

$ffprobeArgs = @('-hide_banner', '-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', $PreviewPath)
$ffprobeOutput = & ffprobe @ffprobeArgs
Set-Content -Path (Join-Path $ArtifactDir 'preview_ffprobe.json') -Value $ffprobeOutput

function Get-VersionLine($Command) {
  try {
    $raw = & $Command '-version'
    if ($null -ne $raw) {
      return ($raw -split "`n")[0].Trim()
    }
  } catch {
    return 'unknown'
  }
  return 'unknown'
}

$metadata = @{ 
  captured_at = (Get-Date).ToString('o')
  preview = $PreviewPath
  tools = @{
    ffmpeg = Get-VersionLine 'ffmpeg'
    ffprobe = Get-VersionLine 'ffprobe'
  }
}

$metadata | ConvertTo-Json -Depth 4 | Set-Content -Path (Join-Path $ArtifactDir 'preview_provenance.json')
