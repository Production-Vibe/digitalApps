@echo off
setlocal

set "URL=%~1"
if "%URL%"=="" set "URL=http://localhost:3000"

echo ============================================
echo   DigitalNaryad - site launcher
echo ============================================
echo.

rem === 1. Docker Engine ===
docker info >nul 2>&1
if %errorlevel%==0 goto docker_ready

echo Docker is not running. Starting Docker Desktop...
if exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" (
    start "" "%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
) else if exist "%ProgramFiles(x86)%\Docker\Docker\Docker Desktop.exe" (
    start "" "%ProgramFiles(x86)%\Docker\Docker\Docker Desktop.exe"
) else (
    echo [!] Docker Desktop.exe not found. Install Docker Desktop.
    pause
    exit /b 1
)

set /a tries=0
:wait_docker
set /a tries+=1
if %tries% gtr 90 (
    echo [!] Docker Engine did not start in ~3 min. Open Docker Desktop manually.
    pause
    exit /b 1
)
docker info >nul 2>&1
if errorlevel 1 (
    timeout /t 2 /nobreak >nul
    goto wait_docker
)

:docker_ready
echo Docker Engine is ready.

rem === 2. Start containers ===
echo Starting containers (docker compose up -d)...
pushd "%~dp0server"
docker compose up -d
if errorlevel 1 (
    popd
    echo [!] docker compose failed. See log above.
    pause
    exit /b 1
)
popd

rem === 3. Wait for site health ===
echo Waiting for site to become ready...
set /a tries=0
:wait_health
set /a tries+=1
if %tries% gtr 120 (
    echo [!] Site did not respond in ~2 min. Check: docker compose ps
    pause
    exit /b 1
)
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:3000/health' -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } } catch { }; exit 1" >nul 2>&1
if errorlevel 1 (
    timeout /t 1 /nobreak >nul
    goto wait_health
)

echo Site is ready.
echo.
echo Opening: %URL%
timeout /t 1 /nobreak >nul
start "" "%URL%"

endlocal
