@echo off
REM ============================================================================
REM MCP Planning Server - Development Start Script
REM ============================================================================
REM This script will:
REM   1. Check Node.js and pnpm installation
REM   2. Install dependencies
REM   3. Build all packages
REM   4. Start Web Server (REST API) on port 8790
REM   5. Start Web Dashboard (Angular) on port 8791
REM ============================================================================

setlocal enabledelayedexpansion

echo.
echo ========================================
echo   MCP Planning Server - Dev Setup
echo ========================================
echo.

REM Check if Node.js is installed
echo [1/5] Checking Node.js installation...
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo ERROR: Node.js is not installed!
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

REM Display Node.js version
for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo   Node.js version: %NODE_VERSION%

REM Check Node.js version (requires 18.19.1+ for Angular 21)
for /f "tokens=1,2,3 delims=.v" %%a in ("%NODE_VERSION%") do (
    set NODE_MAJOR=%%a
    set NODE_MINOR=%%b
    set NODE_PATCH=%%c
)

if %NODE_MAJOR% LSS 18 (
    echo.
    echo ========================================
    echo   ERROR: Node.js version too old!
    echo ========================================
    echo.
    echo This project requires Node.js 18.19.1 or higher.
    echo Your version: %NODE_VERSION%
    echo.
    echo Recommended versions:
    echo   - Node.js 18.19.1 or higher
    echo   - Node.js 20.11.1 or higher
    echo   - Node.js 22.0.0 or higher
    echo.
    echo Download from: https://nodejs.org/
    echo ========================================
    echo.
    pause
    exit /b 1
)

if %NODE_MAJOR% EQU 18 (
    if %NODE_MINOR% LSS 19 (
        echo.
        echo ========================================
        echo   WARNING: Node.js version outdated!
        echo ========================================
        echo.
        echo Angular 21 requires Node.js 18.19.1 or higher.
        echo Your version: %NODE_VERSION%
        echo.
        echo Recommended: Update to 18.19.1+ or 20.11.1+
        echo Download from: https://nodejs.org/
        echo ========================================
        echo.
        pause
        exit /b 1
    )
)
echo.

REM Check if pnpm is installed
echo Checking pnpm installation...
where pnpm >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo.
    echo ========================================
    echo   ERROR: pnpm is NOT installed!
    echo ========================================
    echo.
    echo This project requires pnpm package manager.
    echo.
    echo To install pnpm, run ONE of these commands:
    echo.
    echo   Option 1 - Using npm:
    echo   npm install -g pnpm
    echo.
    echo   Option 2 - Using PowerShell:
    echo   iwr https://get.pnpm.io/install.ps1 -useb ^| iex
    echo.
    echo   Option 3 - Using standalone script:
    echo   https://pnpm.io/installation
    echo.
    echo After installation, run this script again.
    echo ========================================
    echo.
    pause
    exit /b 1
)

REM Display pnpm version
for /f "tokens=*" %%i in ('pnpm --version') do set PNPM_VERSION=%%i
echo   pnpm version: %PNPM_VERSION%
echo.

REM Check if node_modules exists
if not exist "node_modules" (
    echo [2/5] Installing dependencies ^(first time setup^)...
    echo   This may take a few minutes...
    call pnpm install
    if %ERRORLEVEL% neq 0 (
        echo ERROR: Failed to install dependencies!
        pause
        exit /b 1
    )
    echo   Dependencies installed successfully!
) else (
    echo [2/5] Dependencies already installed. Skipping...
)
echo.

REM Check if packages are built
set NEED_BUILD=0
if not exist "packages\config\dist" set NEED_BUILD=1
if not exist "packages\core\dist" set NEED_BUILD=1
if not exist "packages\web-server\dist" set NEED_BUILD=1

if %NEED_BUILD%==1 (
    echo [3/5] Building all packages...
    echo   This may take a minute...
    call pnpm run build
    if %ERRORLEVEL% neq 0 (
        echo ERROR: Build failed!
        pause
        exit /b 1
    )
    echo   Build completed successfully!
) else (
    echo [3/5] Packages already built. Skipping...
    echo   ^(Run "pnpm run build" manually if you made changes^)
)
echo.

echo [4/5] Starting Web Server ^(REST API^)...
echo   URL: http://localhost:8790
echo   Opening in new window...
start "MCP Web Server (API)" cmd /k "pnpm run dev:web"
timeout /t 2 /nobreak >nul
echo   Web Server started!
echo.

echo [5/5] Starting Web Dashboard ^(Angular^)...
echo   URL: http://localhost:8791
echo   Opening in new window...
start "MCP Web Dashboard (UI)" cmd /k "pnpm run dev:dashboard"
timeout /t 2 /nobreak >nul
echo   Web Dashboard starting...
echo.

echo ========================================
echo   Setup Complete!
echo ========================================
echo.
echo   Web Server:   http://localhost:8790
echo   Dashboard:    http://localhost:8791
echo.
echo   Wait for Angular compilation to complete,
echo   then open http://localhost:8791 in your browser.
echo.
echo   Press Ctrl+C in the server windows to stop.
echo ========================================
echo.
pause
