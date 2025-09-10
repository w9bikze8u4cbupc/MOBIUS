@echo off
setlocal enabledelayedexpansion

set ARTIFACTS_DIR=%1
if "%ARTIFACTS_DIR%"=="" set ARTIFACTS_DIR=artifacts

set PREVIEW_PATH=%2
if "%PREVIEW_PATH%"=="" set PREVIEW_PATH=out/preview_with_audio.mp4

mkdir "%ARTIFACTS_DIR%" 2>nul

:: FFmpeg provenance
ffmpeg -version > "%ARTIFACTS_DIR%/ffmpeg_version.txt" 2>&1
ffmpeg -buildconf > "%ARTIFACTS_DIR%/ffmpeg_buildconf.txt" 2>&1
ffmpeg -filters > "%ARTIFACTS_DIR%/ffmpeg_filters.txt" 2>&1

:: ffprobe: streams + format
if exist "%PREVIEW_PATH%" (
    ffprobe -v quiet -of json -show_streams "%PREVIEW_PATH%" > "%ARTIFACTS_DIR%/preview_ffprobe.json" 2>&1
    ffprobe -v quiet -of json -show_format "%PREVIEW_PATH%" > "%ARTIFACTS_DIR%/preview_ffprobe_format.json" 2>&1
)

:: Create a basic reproducibility manifest
echo { > "%ARTIFACTS_DIR%/repro_manifest.json"
echo   "timestamp": "%DATE% %TIME%", >> "%ARTIFACTS_DIR%/repro_manifest.json"
echo   "platform": "Windows Batch Script" >> "%ARTIFACTS_DIR%/repro_manifest.json"
echo } >> "%ARTIFACTS_DIR%/repro_manifest.json"

echo Provenance captured to %ARTIFACTS_DIR%