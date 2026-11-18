@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
set "KANADE_NODE="
where node.exe >nul 2>nul
if not errorlevel 1 set "KANADE_NODE=node.exe"
if not defined KANADE_NODE if exist "%ProgramFiles%\nodejs\node.exe" set "KANADE_NODE=%ProgramFiles%\nodejs\node.exe"
if not defined KANADE_NODE (
  echo Node.js が見つかりません。Node.js 20 以降をインストールしてください。
  echo インストール後、このファイルをもう一度開いてください。
  pause
  exit /b 1
)
"%KANADE_NODE%" -e "process.exit(Number(process.versions.node.split('.')[0]) < 20 ? 1 : 0)"
if errorlevel 1 (
  echo Node.js 20 以降が必要です。
  pause
  exit /b 1
)
title Kanade - Local Development
"%KANADE_NODE%" "%~dp0scripts\dev.mjs" --open
if errorlevel 1 pause
endlocal
