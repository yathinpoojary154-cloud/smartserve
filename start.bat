@echo off
title SmartServe
color 0A
echo ============================================
echo   SmartServe - Starting...
echo ============================================
echo.

:: Check Node.js
where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found!
    echo Download from https://nodejs.org and install, then run this again.
    pause
    exit /b 1
)

cd /d "%~dp0"

:: Install dependencies if missing
if not exist "node_modules" (
    echo Installing dependencies, please wait...
    npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
)

:: Import database into WAMP MySQL
echo Importing database...
set MYSQL=C:\wamp64\bin\mysql\mysql8.4.7\bin\mysql.exe
if not exist "%MYSQL%" set MYSQL=C:\wamp64\bin\mysql\mysql8.0.31\bin\mysql.exe
if not exist "%MYSQL%" set MYSQL=C:\wamp\bin\mysql\mysql8.0.31\bin\mysql.exe
if not exist "%MYSQL%" set MYSQL=C:\xampp\mysql\bin\mysql.exe

if exist "%MYSQL%" (
    "%MYSQL%" -u root < smartserve.sql
    echo Database ready.
) else (
    echo [WARNING] MySQL client not found at common WAMP paths.
    echo Make sure WAMP is running and the database 'smartserve' exists.
    echo You can import smartserve.sql manually via phpMyAdmin.
)

echo.
echo ============================================
echo   SmartServe is starting on port 8080
echo   Open: http://localhost:8080/
echo ============================================
echo.
echo Press Ctrl+C to stop the server.
echo.

node server.js
pause
