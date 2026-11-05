@echo off
rem Lance la desinstallation de Ndamely en administrateur. Les donnees de l'ecole sont conservees.
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File \"%~dp0uninstall.ps1\"'"
