@echo off
setlocal

cd /d "%~dp0"

echo ============================================
echo   DigitalNaryad - T1 nda-architect launcher
echo ============================================
echo.

where opencode >nul 2>&1
if errorlevel 1 (
    echo [!] opencode not found in PATH.
    pause
    exit /b 1
)

opencode --agent nda-architect %*
set "EXITCODE=%errorlevel%"

endlocal & exit /b %EXITCODE%
