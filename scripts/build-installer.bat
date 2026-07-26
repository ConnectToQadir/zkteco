@echo off
setlocal
cd /d "%~dp0\.."

echo ========================================
echo  PunchType — Build Windows Installer
echo ========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js is not installed on this PC.
  echo Install Node.js LTS from https://nodejs.org then retry.
  exit /b 1
)

echo [1/3] npm install...
call npm install
if errorlevel 1 exit /b 1

echo.
echo [2/3] Building PunchType.exe into dist\ ...
call npm run build
if errorlevel 1 exit /b 1

echo.
echo [3/3] Compiling Setup installer with Inno Setup...
call npm run build:installer
if errorlevel 1 exit /b 1

echo.
echo Done.
echo Upload this file to your website:
echo   release\PunchType-Setup-1.0.0.exe
echo.
pause
