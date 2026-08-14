@echo off
setlocal
title OutreachKit
chcp 65001 >nul 2>nul
cd /d "%~dp0"

set "URL=http://localhost:3000"
set "NODE=node"

echo.
echo   ==========================================
echo     OutreachKit - Instagram DM automation
echo   ==========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  if exist "%ProgramFiles%\nodejs\node.exe" (
    set "NODE=%ProgramFiles%\nodejs\node.exe"
  ) else if exist "%LocalAppData%\Programs\nodejs\node.exe" (
    set "NODE=%LocalAppData%\Programs\nodejs\node.exe"
  ) else if exist "%APPDATA%\nvm\current\node.exe" (
    set "NODE=%APPDATA%\nvm\current\node.exe"
  ) else (
    echo.
    echo   [ERROR] Node.js was not found.
    echo   Download it from https://nodejs.org and install it, then run this again.
    echo.
    pause
    exit /b 1
  )
)

if not exist "node_modules" (
  echo   Installing dependencies, first run only...
  call npm install
  if errorlevel 1 (
    echo.
    echo   [ERROR] npm install failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
)

set "CHROME=C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"

powershell -NoProfile -Command "try { (Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 '%URL%/api/status') | Out-Null; exit 0 } catch { exit 1 }" >nul 2>nul
if not errorlevel 1 goto already

echo   Starting OutreachKit...
set "OUTREACHKIT_NO_OPEN=1"
start "" /B "%NODE%" "%~dp0gui\server.js"

set "READY=0"
set "TRIES=0"

:probe
timeout /t 2 /nobreak >nul 2>nul || ping -n 3 127.0.0.1 >nul
powershell -NoProfile -Command "try { (Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 '%URL%/api/status') | Out-Null; exit 0 } catch { exit 1 }" >nul 2>nul
if not errorlevel 1 goto up
if "%READY%"=="1" goto stopped
set /a TRIES+=1
if %TRIES% GEQ 30 goto failed
goto probe

:up
if "%READY%"=="1" goto probe
set "READY=1"
echo   Server is up - opening Chrome.
if exist "%CHROME%" (
  start "" "%CHROME%" "%URL%"
) else (
  start "" "%URL%"
)
goto probe

:failed
echo.
echo   [ERROR] The server did not start. See the output above for details.
pause
exit /b 1

:already
echo   OutreachKit is already running - opening Chrome.
if exist "%CHROME%" (
  start "" "%CHROME%" "%URL%"
) else (
  start "" "%URL%"
)
exit /b 0

:stopped
echo.
echo   OutreachKit stopped.
pause
