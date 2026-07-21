@echo off
REM Starts ABUsites Companion: Ollama (if installed and not already running),
REM then the app itself, then opens it in your browser. Safe to double-click
REM any time, does nothing harmful if things are already running.

cd /d "%~dp0"

echo Checking Ollama...
tasklist /FI "IMAGENAME eq ollama.exe" 2>NUL | find /I "ollama.exe" >NUL
if errorlevel 1 (
    where ollama >nul 2>nul
    if not errorlevel 1 (
        echo Starting Ollama...
        start "Ollama" /min ollama serve
        timeout /t 3 /nobreak >nul
    )
)

echo Starting ABUsites Companion...
start "ABUsites Companion" /min cmd /c "npm start"

echo Waiting for the app to be ready, this can take a few seconds...

:waitloop
timeout /t 2 /nobreak >nul
powershell -NoProfile -Command "try { Invoke-WebRequest -Uri http://localhost:3000 -TimeoutSec 2 -UseBasicParsing | Out-Null; exit 0 } catch { exit 1 }"
if errorlevel 1 goto waitloop

start "" "http://localhost:3000"
echo.
echo ABUsites Companion is running at http://localhost:3000
echo You can close this window, the app keeps running in the background.
echo To stop it later, double-click "Stop ABUsites Companion" on your Desktop.
echo.
pause
