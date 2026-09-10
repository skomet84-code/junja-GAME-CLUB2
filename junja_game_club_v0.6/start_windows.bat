@echo off
cd /d %~dp0
start http://localhost:10000
node server.js
pause
