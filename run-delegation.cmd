@echo off
setlocal

cd /d "%~dp0"

echo ============================================
echo   DigitalNaryad - two-terminal fallback launcher
echo   (out of VS Code; in VS Code press Ctrl+Shift+B)
echo.
echo   T2 = orchestrator log window (new window)
echo   T1 = architect (this window)
echo ============================================
echo.

where opencode >nul 2>&1
if errorlevel 1 (
    echo [!] opencode not found in PATH.
    pause
    exit /b 1
)
where npm >nul 2>&1
if errorlevel 1 (
    echo [!] npm not found in PATH.
    pause
    exit /b 1
)

start "NDA T2 - orchestrator log" powershell -NoExit -NoProfile -ExecutionPolicy Bypass -File "%~dp0nda-run.ps1" -Mode watch

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0nda-run.ps1" -Mode architect
set "EXITCODE=%errorlevel%"

endlocal & exit /b %EXITCODE%
