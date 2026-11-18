@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "KANADE_NODE=node.exe"
where node.exe >nul 2>nul
if errorlevel 1 set "KANADE_NODE=%ProgramFiles%\nodejs\node.exe"
"%KANADE_NODE%" scripts\test.mjs
pause
