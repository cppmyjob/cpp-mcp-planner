#!/bin/bash
# ============================================================================
# MCP Planning Server - Development Start Script (Linux/macOS)
# ============================================================================
# This script will:
#   1. Check Node.js and pnpm installation
#   2. Install dependencies
#   3. Build all packages
#   4. Start Web Server (REST API) on port 8790
#   5. Start Web Dashboard (Angular) on port 8791
# ============================================================================

set -e  # Exit on error

echo ""
echo "========================================"
echo "  MCP Planning Server - Dev Setup"
echo "========================================"
echo ""

# Check if Node.js is installed
echo "[1/5] Checking Node.js installation..."
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed!"
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node --version)
echo "  Node.js version: $NODE_VERSION"
echo ""

# Check if pnpm is installed
echo "Checking pnpm installation..."
if ! command -v pnpm &> /dev/null; then
    echo ""
    echo "========================================"
    echo "  ERROR: pnpm is NOT installed!"
    echo "========================================"
    echo ""
    echo "This project requires pnpm package manager."
    echo ""
    echo "To install pnpm, run ONE of these commands:"
    echo ""
    echo "  Option 1 - Using npm:"
    echo "  npm install -g pnpm"
    echo ""
    echo "  Option 2 - Using curl (recommended):"
    echo "  curl -fsSL https://get.pnpm.io/install.sh | sh -"
    echo ""
    echo "  Option 3 - Using wget:"
    echo "  wget -qO- https://get.pnpm.io/install.sh | sh -"
    echo ""
    echo "  Option 4 - Using Homebrew (macOS):"
    echo "  brew install pnpm"
    echo ""
    echo "After installation, restart your terminal and run this script again."
    echo "========================================"
    echo ""
    exit 1
fi

PNPM_VERSION=$(pnpm --version)
echo "  pnpm version: $PNPM_VERSION"
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "[2/5] Installing dependencies (first time setup)..."
    echo "  This may take a few minutes..."
    pnpm install
    echo "  Dependencies installed successfully!"
else
    echo "[2/5] Dependencies already installed. Skipping..."
fi
echo ""

# Check if packages are built
NEED_BUILD=0
[ ! -d "packages/config/dist" ] && NEED_BUILD=1
[ ! -d "packages/core/dist" ] && NEED_BUILD=1
[ ! -d "packages/web-server/dist" ] && NEED_BUILD=1

if [ $NEED_BUILD -eq 1 ]; then
    echo "[3/5] Building all packages..."
    echo "  This may take a minute..."
    pnpm run build
    echo "  Build completed successfully!"
else
    echo "[3/5] Packages already built. Skipping..."
    echo "  (Run 'pnpm run build' manually if you made changes)"
fi
echo ""

echo "[4/5] Starting Web Server (REST API)..."
echo "  URL: http://localhost:8790"

# Start web server in background
pnpm run dev:web &
WEB_SERVER_PID=$!
echo "  Web Server started (PID: $WEB_SERVER_PID)"
sleep 2
echo ""

echo "[5/5] Starting Web Dashboard (Angular)..."
echo "  URL: http://localhost:8791"

# Start dashboard in background
pnpm run dev:dashboard &
DASHBOARD_PID=$!
echo "  Web Dashboard started (PID: $DASHBOARD_PID)"
sleep 2
echo ""

echo "========================================"
echo "  Setup Complete!"
echo "========================================"
echo ""
echo "  Web Server:   http://localhost:8790"
echo "  Dashboard:    http://localhost:8791"
echo ""
echo "  Wait for Angular compilation to complete,"
echo "  then open http://localhost:8791 in your browser."
echo ""
echo "  To stop servers:"
echo "    kill $WEB_SERVER_PID $DASHBOARD_PID"
echo ""
echo "  Or press Ctrl+C and run:"
echo "    pkill -f 'pnpm run dev'"
echo "========================================"
echo ""

# Wait for user interrupt
trap "echo 'Stopping servers...'; kill $WEB_SERVER_PID $DASHBOARD_PID 2>/dev/null; exit 0" INT TERM

# Keep script running
wait
