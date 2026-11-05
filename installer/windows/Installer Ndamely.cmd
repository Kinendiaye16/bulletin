@echo off
rem Lance l'installation de Ndamely en administrateur (Windows demande l'autorisation).
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File \"%~dp0install.ps1\"'"
