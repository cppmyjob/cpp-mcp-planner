@echo off
REM ============================================================================
REM MCP Planning Server - Quick Start Script
REM ============================================================================
REM Use this if dependencies are already installed and project is built.
REM For first-time setup, use start-dev.bat instead.
REM ============================================================================

echo.
echo ========================================
echo   MCP Planning Server - Quick Start
echo ========================================
echo.
echo Starting servers...
echo.

REM Start Web Server (REST API)
echo Starting Web Server on http://localhost:8790
start "MCP Web Server (API)" cmd /k "npm run dev:web"
timeout /t 2 /nobreak >nul

REM Start Web Dashboard (Angular)
echo Starting Web Dashboard on http://localhost:8791
start "MCP Web Dashboard (UI)" cmd /k "npm run dev:dashboard"
timeout /t 2 /nobreak >nul

echo.
echo ========================================
echo   Servers Started!
echo ========================================
echo.
echo   Web Server:   http://localhost:8790
echo   Dashboard:    http://localhost:8791
echo.
echo   Wait for compilation, then open:
echo   http://localhost:8791
echo.
echo   Press Ctrl+C in server windows to stop.
echo ========================================
echo.
