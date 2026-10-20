@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
set "GRAMMERS_NODE="
for /f "delims=" %%I in ('where node.exe 2^>nul') do if not defined GRAMMERS_NODE set "GRAMMERS_NODE=%%I"
if not defined GRAMMERS_NODE if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" set "GRAMMERS_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not defined GRAMMERS_NODE (
  echo Для разработки требуется Node.js 22.12 или новее.
  pause
  exit /b 1
)
if not exist "node_modules\vite\bin\vite.js" (
  echo Сначала необходимо установить зависимости проекта: npm ci
  pause
  exit /b 1
)
echo Откройте http://127.0.0.1:4181/Blocks/index.html
echo SCSS компилируется при сохранении. Для остановки нажмите Ctrl+C.
"%GRAMMERS_NODE%" "node_modules\vite\bin\vite.js"
if errorlevel 1 pause
