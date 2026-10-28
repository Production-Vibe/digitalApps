@echo off
setlocal
cd /d "%~dp0"

echo ================================================
echo   DigitalNaryad - agent interactive wrapper
echo ================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0.opencode\loop\interactive-wrapper.ps1" %*
set "RC=%errorlevel%"

if not "%RC%"=="0" (
    echo.
    echo [!] Wrapper exited with code %RC%. Logs: .opencode\loop\logs\
    pause
)

endlocal & exit /b %RC%
