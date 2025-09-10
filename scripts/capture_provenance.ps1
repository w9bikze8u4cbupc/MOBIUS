param(
    [string]$ArtifactsDir = "artifacts",
    [string]$PreviewPath = "out/preview_with_audio.mp4"
)

# Create artifacts directory
New-Item -ItemType Directory -Path $ArtifactsDir -Force | Out-Null

# FFmpeg provenance
ffmpeg -version | Out-File -FilePath "$ArtifactsDir/ffmpeg_version.txt" -Encoding UTF8
ffmpeg -buildconf | Out-File -FilePath "$ArtifactsDir/ffmpeg_buildconf.txt" -Encoding UTF8
ffmpeg -filters | Out-File -FilePath "$ArtifactsDir/ffmpeg_filters.txt" -Encoding UTF8

# ffprobe: streams + format
if (Test-Path $PreviewPath) {
    ffprobe -v quiet -of json -show_streams $PreviewPath | Out-File -FilePath "$ArtifactsDir/preview_ffprobe.json" -Encoding UTF8
    ffprobe -v quiet -of json -show_format $PreviewPath | Out-File -FilePath "$ArtifactsDir/preview_ffprobe_format.json" -Encoding UTF8
}

# System + toolchain provenance
$reproManifest = @{
    timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    git = @{
        commit = if (git rev-parse --short HEAD 2>$null) { git rev-parse --short HEAD 2>$null } else { "unknown" }
        branch = if (git rev-parse --abbrev-ref HEAD 2>$null) { git rev-parse --abbrev-ref HEAD 2>$null } else { "unknown" }
    }
    node = @{
        nodeVersion = if (node -v 2>$null) { node -v 2>$null } else { "unknown" }
        npmVersion = if (npm -v 2>$null) { npm -v 2>$null } else { "unknown" }
    }
    typescript = @{
        tscVersion = if (npx tsc -v 2>$null) { npx tsc -v 2>$null } else { "unknown" }
    }
    os = @{
        platform = $env:OS
        version = [System.Environment]::OSVersion.VersionString
    }
}

$reproManifest | ConvertTo-Json | Out-File -FilePath "$ArtifactsDir/repro_manifest.json" -Encoding UTF8

Write-Host "Provenance captured to $ArtifactsDir"