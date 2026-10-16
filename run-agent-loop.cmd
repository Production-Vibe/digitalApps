@echo off
setlocal
cd /d "%~dp0"

echo ============================================
echo   DigitalNaryad - agent loop (session-loop)
echo ============================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0.opencode\loop\ralph-loop.ps1" %*
set "RC=%errorlevel%"

if not "%RC%"=="0" (
    echo.
    echo [!] Loop exited with code %RC%. Logs: .opencode\loop\logs\
    pause
)

endlocal & exit /b %RC%
