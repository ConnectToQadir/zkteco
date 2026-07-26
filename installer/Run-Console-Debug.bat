@echo off
cd /d "%~dp0"
echo Starting PunchType in console mode...
echo If Settings fail to open, read any error below or logs\startup-error.log
echo.
PunchType.exe
echo.
echo Exit code: %ERRORLEVEL%
pause
