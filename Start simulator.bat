@echo off
rem Double-click to open the WH3 duel simulator: starts the local server and opens the page.
rem Close this window to stop the server.
cd /d "%~dp0"
start "" http://localhost:8766
where uv >nul 2>nul && (uv run --quiet python serve.py 8766) || (python serve.py 8766)
