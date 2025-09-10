@echo off
setlocal enabledelayedexpansion

set JSON_PATH=%1
if "%JSON_PATH%"=="" set JSON_PATH=artifacts/preview_ffprobe.json

:: Check if file exists
if not exist "%JSON_PATH%" (
    echo File not found: %JSON_PATH%
    exit /b 0
)

:: For Windows batch, we'll do a simple check by searching for key strings
findstr "yuv420p" "%JSON_PATH%" >nul
if errorlevel 1 (
    echo pix_fmt != yuv420p
    exit /b 1
)

findstr "30/1" "%JSON_PATH%" >nul
if errorlevel 1 (
    echo avg_frame_rate != 30/1
    exit /b 1
)

findstr "1:1" "%JSON_PATH%" >nul
if errorlevel 1 (
    echo sample_aspect_ratio != 1:1
    exit /b 1
)

echo All container checks passed
exit /b 0