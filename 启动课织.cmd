@echo off
setlocal
cd /d "%~dp0"
title Kezhi - One Click Start

if exist "src-tauri\target\release\kezhi.exe" (
  start "" "src-tauri\target\release\kezhi.exe"
  exit /b 0
)

bun --version >nul 2>nul
if errorlevel 1 (
  echo Kezhi has not been built, and Bun was not found.
  pause
  exit /b 1
)

bun run tauri dev
if errorlevel 1 (
  echo.
  echo Kezhi failed to start. See the error above.
  pause
)
