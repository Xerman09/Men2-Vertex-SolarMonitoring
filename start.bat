@echo off
title Deye Solar Monitoring (DSM) - Mission Control
cd /d "%~dp0"

echo ======================================================================
echo    DEYE SOLAR MONITORING (DSM) - VOS MULTI-ACCOUNT FLEET ENGINE
echo ======================================================================
echo.
echo Checking Node.js environment...
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed or not found in PATH!
    echo Please install Node.js v18+ to run this system.
    pause
    exit /b 1
)

echo Starting DSM Next.js service on port 3005...
echo   - Localhost:    http://localhost:3005
echo   - Local Wi-Fi:  http://192.168.1.202:3005
echo   - Hostname URL: http://%COMPUTERNAME%:3005
echo.

start "" http://localhost:3005
npm run dev
