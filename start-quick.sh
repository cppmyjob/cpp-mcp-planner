#!/bin/bash
# ============================================================================
# MCP Planning Server - Quick Start Script (Linux/macOS)
# ============================================================================
# Use this if dependencies are already installed and project is built.
# For first-time setup, use start-dev.sh instead.
# ============================================================================

echo ""
echo "========================================"
echo "  MCP Planning Server - Quick Start"
echo "========================================"
echo ""
echo "Starting servers..."
echo ""

# Start Web Server (REST API)
echo "Starting Web Server on http://localhost:8790"
npm run dev:web &
WEB_SERVER_PID=$!
sleep 2

# Start Web Dashboard (Angular)
echo "Starting Web Dashboard on http://localhost:8791"
npm run dev:dashboard &
DASHBOARD_PID=$!
sleep 2

echo ""
echo "========================================"
echo "  Servers Started!"
echo "========================================"
echo ""
echo "  Web Server:   http://localhost:8790"
echo "  Dashboard:    http://localhost:8791"
echo ""
echo "  Wait for compilation, then open:"
echo "  http://localhost:8791"
echo ""
echo "  To stop servers:"
echo "    kill $WEB_SERVER_PID $DASHBOARD_PID"
echo ""
echo "  Or press Ctrl+C"
echo "========================================"
echo ""

# Wait for user interrupt
trap "echo 'Stopping servers...'; kill $WEB_SERVER_PID $DASHBOARD_PID 2>/dev/null; exit 0" INT TERM

# Keep script running
wait
