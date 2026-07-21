@echo off
REM Stops ABUsites Companion cleanly: kills whatever process owns port 3000
REM (the app, regardless of how it was launched) and stops Ollama. Precise
REM by port/process rather than a blanket "kill all node.exe", so it won't
REM touch unrelated Node processes on the machine.

echo Stopping ABUsites Companion...
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"
powershell -NoProfile -Command "Get-Process ollama -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue"

echo Done. ABUsites Companion has been stopped.
pause
