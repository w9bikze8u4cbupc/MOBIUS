@echo off
setlocal

for /f "tokens=5" %%I in ('netstat -ano ^| findstr /r ":3000 .*LISTENING"') do (
  echo Killing PID %%I on port 3000
  taskkill /PID %%I /F >nul 2>&1
)

for /f "tokens=5" %%I in ('netstat -ano ^| findstr /r ":5001 .*LISTENING"') do (
  echo Killing PID %%I on port 5001
  taskkill /PID %%I /F >nul 2>&1
)

echo Done.
pause