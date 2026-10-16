@echo off
rem Startet den lokalen Bunkerplaner-Server und oeffnet den Browser (http://127.0.0.1:8874/).
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 server.py
  goto ende
)
where python >nul 2>nul
if %errorlevel%==0 (
  python server.py
  goto ende
)
echo Python 3.9 oder neuer wurde nicht gefunden.
echo Bitte von https://www.python.org/downloads/ installieren und dabei "Add python.exe to PATH" waehlen.
:ende
pause
