@echo off
echo ========================================================
echo   OpenSlop II Web
echo   Windows Launch Script (DirectX 12 / Vulkan Acceleration)
echo ========================================================

set PORT=5173
set URL=http://localhost:%PORT%

cd /d "%~dp0"
if not exist node_modules (
  echo [*] Installing dependencies ^(first run only^)...
  call bun install || call npm install
)

echo [*] Starting game server...
start /B bun server/relay.ts
start /B bun run dev || start /B npm run dev

timeout /t 2 /nobreak >nul

echo [*] Launching standalone app window...
start msedge --app="%URL%" || start chrome --app="%URL%" || start "%URL%"

echo Game launched at %URL%
pause
