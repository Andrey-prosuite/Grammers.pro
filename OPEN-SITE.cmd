@echo off
setlocal
cd /d "%~dp0"
if errorlevel 1 goto failed

where node.exe >nul 2>nul
if errorlevel 1 goto missing_node
where npm.cmd >nul 2>nul
if errorlevel 1 goto missing_node

echo Installing project dependencies...
call npm.cmd ci --no-audit --no-fund
if errorlevel 1 goto failed

echo Building the static page...
call npm.cmd run build
if errorlevel 1 goto failed

if not exist "%~dp0dist\index.html" goto failed
start "" "%~dp0dist\index.html"
exit /b 0

:missing_node
echo Install Node.js 24 LTS with npm, then open this file again.
echo Download: https://nodejs.org/en/download
start "" "https://nodejs.org/en/download"
pause
exit /b 1

:failed
echo The site could not be built. Send a screenshot of this window in the chat.
pause
exit /b 1
