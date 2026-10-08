@echo off
cd /d "%~dp0"
title Pulse - techno by voice
where node >nul 2>nul
if errorlevel 1 goto nonode
node server.js %*
if errorlevel 1 pause
exit /b

:nonode
echo Node.js was not found. Install it from https://nodejs.org and run this file again.
pause
