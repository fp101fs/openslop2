#!/bin/bash
set -e

PORT=5173
URL="http://localhost:${PORT}"

echo "========================================================"
echo "  OpenSlop II Web"
echo "  Apple Silicon M1 Optimization Enabled (Metal Backend)"
echo "========================================================"

# Check if node or bun is available
if command -v bun &> /dev/null; then
  RUNNER="bun"
elif command -v npm &> /dev/null; then
  RUNNER="npm"
else
  echo "Error: Neither bun nor npm found. Please install node.js or bun."
  exit 1
fi

# First run after cloning: install dependencies
cd "$(dirname "$0")"
if [ ! -d node_modules ]; then
  echo "[*] Installing dependencies (first run only)..."
  if [ "$RUNNER" = "bun" ]; then bun install; else npm install; fi
fi

# Multiplayer relay (rooms, game list, invite codes) on :8787
if command -v bun &> /dev/null && ! lsof -i :8787 > /dev/null 2>&1; then
  echo "[*] Starting multiplayer relay on :8787..."
  bun server/relay.ts &
fi

# Check if server already running
if ! lsof -i :${PORT} > /dev/null 2>&1; then
  echo "[*] Starting local high-performance game server..."
  if [ "$RUNNER" = "bun" ]; then
    bun run dev &
  else
    npm run dev &
  fi
  SERVER_PID=$!
  sleep 1.5
else
  echo "[*] Server already running on port ${PORT}."
fi

echo "[*] Launching game client with Metal hardware acceleration..."

# Launch with Google Chrome or default browser
if [ -d "/Applications/Google Chrome.app" ]; then
  open -a "Google Chrome" "${URL}"
elif [ -d "/Applications/Brave Browser.app" ]; then
  open -a "Brave Browser" "${URL}"
else
  open "${URL}"
fi

echo "========================================================"
echo "  Game launched successfully at ${URL}"
echo "  Press Ctrl+C in terminal if you wish to stop the server"
echo "========================================================"
