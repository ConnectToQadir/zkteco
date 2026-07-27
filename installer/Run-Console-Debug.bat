@echo off
cd /d "%~dp0"
echo Starting PunchType in console mode (no --background)...
echo.
echo Logs folder: %LOCALAPPDATA%\PunchType\logs
echo   - startup-error.log  (crash details)
echo   - YYYY-MM-DD.log     (daily application log)
echo.
PunchType.exe
echo.
echo Exit code: %ERRORLEVEL%
pause
