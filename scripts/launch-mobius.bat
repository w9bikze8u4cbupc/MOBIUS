@echo off
:: Mobius Tutorial Generator Launcher
:: This script launches the Mobius Tutorial Generator in the default browser

setlocal EnableDelayedExpansion

:: Display startup message
echo ========================================
echo   Mobius Tutorial Generator Launcher
echo ========================================

echo.
:: Check for Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js is required but not found.
    echo Please install Node.js from https://nodejs.org/
    echo.
    echo Press any key to continue...
    pause >nul
    exit /b 1
)

echo Node.js detected: OK

echo.
echo Starting Mobius Tutorial Generator servers...

:: Change to the project root directory
cd /d "%~dp0.."

:: Start the API server in the background
start "Mobius Server" /min cmd /c "npm run server"
echo API server started (port 5001)

:: Wait a few seconds for the server to start
echo Waiting for API server to initialize (3 seconds)...
timeout /t 3 /nobreak >nul

echo.
:: Start the UI development server and capture output
echo Starting UI development server...
echo (This may take a moment as Vite compiles the application...)
start "Mobius UI Server" /min cmd /c "npm run ui > ui_output.log 2>&1"
echo UI development server started in background

:: Wait for the server to initialize
echo Waiting for UI server to initialize (20 seconds)...
timeout /t 20 /nobreak >nul

echo.
:: Try to detect the actual port being used by parsing the log
echo Detecting UI server port...
for /f "tokens=5" %%a in ('findstr "Local:" ui_output.log 2^>nul') do set UI_PORT=%%a
if "!UI_PORT!"=="" (
    echo Could not detect port from log, trying common ports...
    curl -s --connect-timeout 5 http://localhost:3003 >nul 2>&1
    if !errorlevel! equ 0 (
        set UI_PORT=http://localhost:3003
        echo Found server on port 3003
    ) else (
        curl -s --connect-timeout 5 http://localhost:3002 >nul 2>&1
        if !errorlevel! equ 0 (
            set UI_PORT=http://localhost:3002
            echo Found server on port 3002
        ) else (
            curl -s --connect-timeout 5 http://localhost:3001 >nul 2>&1
            if !errorlevel! equ 0 (
                set UI_PORT=http://localhost:3001
                echo Found server on port 3001
            ) else (
                curl -s --connect-timeout 5 http://localhost:3000 >nul 2>&1
                if !errorlevel! equ 0 (
                    set UI_PORT=http://localhost:3000
                    echo Found server on port 3000
                ) else (
                    echo Could not detect any running server, using default
                    set UI_PORT=http://localhost:3000
                )
            )
        )
    )
) else (
    echo Detected server on !UI_PORT!
)

echo Opening browser to: !UI_PORT!

:: Launch the application in the default browser
start "" "!UI_PORT!"

:: Display success message
echo.
echo ========================================
echo The Mobius Tutorial Generator is starting!
echo ========================================
echo.
echo The servers are starting and the application should open in your browser.

echo.
echo If you see a blank page or error in your browser:
echo   * Wait up to 30 seconds and refresh the page
echo   * Check that both terminal windows remain open
echo   * Make sure no firewall is blocking the ports
echo   * Try accessing !UI_PORT! directly in your browser

echo.
echo To stop the servers later:
echo   * Close the terminal window titled "Mobius Server"
echo   * Close the terminal window titled "Mobius UI Server"

echo.
echo Press any key to close this window...
echo (The servers will continue running in the background)
echo.
pause >nul

del ui_output.log >nul 2>&1

exit /b 0