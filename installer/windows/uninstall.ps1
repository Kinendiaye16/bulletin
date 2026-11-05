# Désinstallation de Ndamely (à lancer en administrateur). Les données de l'école sont conservées.
$ErrorActionPreference = 'Continue'
$Cible   = Join-Path $env:ProgramFiles 'Ndamely'
$Donnees = Join-Path $env:ProgramData 'Ndamely'

$node = Join-Path $Cible 'node\node.exe'
Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $node } | Stop-Process -Force

Remove-Item -Force -ErrorAction SilentlyContinue (Join-Path ([Environment]::GetFolderPath('CommonDesktopDirectory')) 'Ndamely.lnk')
Remove-Item -Force -ErrorAction SilentlyContinue (Join-Path ([Environment]::GetFolderPath('CommonStartup')) 'Ndamely.lnk')
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue (Join-Path ([Environment]::GetFolderPath('CommonPrograms')) 'Ndamely')
Get-NetFirewallRule -DisplayName 'Ndamely' -ErrorAction SilentlyContinue | Remove-NetFirewallRule

Set-Location $env:TEMP
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $Cible

Write-Host ''
Write-Host '  Ndamely est désinstallé.' -ForegroundColor Green
Write-Host "  Les données de l'école (notes, élèves, sauvegardes) sont conservées dans : $Donnees"
Write-Host '  Supprimez ce dossier vous-même seulement si vous êtes sûre de ne plus en avoir besoin.'
Write-Host ''
Read-Host '  Appuyez sur Entrée pour fermer cette fenêtre'
