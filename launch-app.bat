@echo off
setlocal
title Mobius Games Tutorial Generator

REM Change to repo root (this file should live in the repo root)
cd /d "%~dp0"

REM Check Node/npm
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed or not on PATH.
  echo Please install from https://nodejs.org and try again.
  pause
  exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
  echo npm is not available on PATH.
  pause
  exit /b 1
)

REM Install root deps if missing
if not exist "node_modules" (
  echo Installing dependencies...
  if exist "package-lock.json" (
    call npm ci || goto :error
  ) else (
    call npm install || goto :error
  )
)

REM Optional: install client/server deps if present (monorepo-friendly)
if exist "client\package.json" if not exist "client\node_modules" (
  echo Installing client dependencies...
  if exist "client\package-lock.json" (
    call npm --prefix client ci || goto :error
  ) else (
    call npm --prefix client install || goto :error
  )
)

REM Launch the app in a new minimized console window
start "Mobius Tutorial Generator" /min cmd /c "npm run dev"

REM Wait for frontend to be ready then open browser
echo Waiting for http://localhost:3000 ...
powershell -NoLogo -NoProfile -Command ^
  "$deadline = (Get-Date).AddSeconds(120);" ^
  "while((Get-Date) -lt $deadline){" ^
  "try{ $c = New-Object Net.Sockets.TcpClient('127.0.0.1',3000); $c.Close(); exit 0 }catch{}" ^
  "Start-Sleep -Seconds 1 }; exit 1"
if errorlevel 1 (
  echo Timed out waiting for port 3000. The app may still be starting.
  goto :eof
)
start "" "http://localhost:3000"
goto :eof

:error
echo.
echo A command failed. See messages above.
pause
exit /b 1