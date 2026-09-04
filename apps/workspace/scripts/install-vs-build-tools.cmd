@echo off
REM Run as Administrator. Uses --quiet (not --passive) on vs_BuildTools.exe directly.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-vs-build-tools.ps1"
