@echo off
setlocal

set BACKEND_PORT=5001
set FRONTEND_PORT=3000
set ROOT_DIR=%~dp0
set FRONTEND_DIR=%ROOT_DIR%client
set SMOKE_CMD=npm run test:smoke

REM Kill existing listeners on ports (best-effort)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :%BACKEND_PORT%') do (
  if "%%a" NEQ "" taskkill /PID %%a /F >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :%FRONTEND_PORT%') do (
  if "%%a" NEQ "" taskkill /PID %%a /F >nul 2>&1
)

REM Start backend
echo Starting backend...
start "" cmd /c "cd /d %ROOT_DIR% && npm run server > %TEMP%\mobius-backend.log 2>&1"
timeout /t 3 /nobreak >nul

REM Start frontend
echo Starting frontend...
start "" cmd /c "cd /d %FRONTEND_DIR% && npm start > %TEMP%\mobius-frontend.log 2>&1"
timeout /t 3 /nobreak >nul

REM Wait for backend health
powershell -Command ^
  "$tries=0; while($tries -lt 60) { try { Invoke-WebRequest -UseBasicParsing http://localhost:%BACKEND_PORT%/healthz -TimeoutSec 3; Write-Host 'backend up'; exit 0 } catch { Start-Sleep -Seconds 1; $tries++ } } ; exit 1"

if ERRORLEVEL 1 (
  echo Backend did not start in time. See %TEMP%\mobius-backend.log
  exit /b 1
)

REM Wait for frontend
powershell -Command ^
  "$tries=0; while($tries -lt 60) { try { Invoke-WebRequest -UseBasicParsing http://localhost:%FRONTEND_PORT% -TimeoutSec 3; Write-Host 'frontend up'; exit 0 } catch { Start-Sleep -Seconds 1; $tries++ } } ; exit 1"

if ERRORLEVEL 1 (
  echo Frontend did not start in time.
  exit /b 1
)

REM Run smoke
echo Running smoke tests: %SMOKE_CMD%
cd /d %ROOT_DIR%
%SMOKE_CMD%
if ERRORLEVEL 1 (
  echo Smoke tests failed
  exit /b 1
)

echo Smoke tests passed ✅
endlocal