@echo off
chcp 65001 >nul
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-android.ps1"
set "KEZHI_EXIT=%ERRORLEVEL%"
if not "%KEZHI_EXIT%"=="0" pause
exit /b %KEZHI_EXIT%
