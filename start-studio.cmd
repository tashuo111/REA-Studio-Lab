@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if not errorlevel 1 (
  set "STUDIO_NODE=node"
) else (
  set "STUDIO_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
)
if not "%STUDIO_NODE%"=="node" if not exist "%STUDIO_NODE%" (
  echo Node.js was not found. Install Node.js 22.19 or newer and try again.
  pause
  exit /b 1
)
echo REA Studio Lab - local prototype
echo Open the address printed below in Chrome or Edge.
echo Keep this window open. Press Ctrl+C to stop.
"%STUDIO_NODE%" "%~dp0studio\server.mjs"
if errorlevel 1 pause
