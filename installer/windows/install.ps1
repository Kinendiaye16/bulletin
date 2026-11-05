# Installation de Ndamely sur l'ordinateur de l'école (à lancer en administrateur, via « Installer Ndamely.cmd »).
$ErrorActionPreference = 'Stop'
$Source  = $PSScriptRoot
$Cible   = Join-Path $env:ProgramFiles 'Ndamely'
$Donnees = Join-Path $env:ProgramData 'Ndamely'
$Port    = 4500

Write-Host ''
Write-Host '  Installation de Ndamely' -ForegroundColor Green
Write-Host '  -----------------------'

# 1. Arrêter une ancienne version qui tournerait encore (mise à jour)
$ancien = Join-Path $Cible 'node\node.exe'
Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $ancien } | Stop-Process -Force
Start-Sleep -Milliseconds 500

# 2. Copier le logiciel (les données, elles, restent dans ProgramData)
Write-Host "  Copie des fichiers dans $Cible"
if (Test-Path (Join-Path $Cible 'app')) { Remove-Item -Recurse -Force (Join-Path $Cible 'app') }
New-Item -ItemType Directory -Force -Path $Cible | Out-Null
foreach ($element in 'app', 'node', 'Ndamely.ps1', 'Arreter-Ndamely.ps1', 'uninstall.ps1', 'Desinstaller Ndamely.cmd', 'ndamely.ico', 'LISEZ-MOI.txt') {
  Copy-Item -Recurse -Force (Join-Path $Source $element) $Cible
}

# 3. Dossier des données, modifiable par tous les utilisateurs de l'ordinateur
Write-Host "  Dossier des données : $Donnees"
New-Item -ItemType Directory -Force -Path $Donnees | Out-Null
icacls $Donnees /grant '*S-1-5-32-545:(OI)(CI)M' /T /Q | Out-Null   # groupe « Utilisateurs »

# 4. Raccourcis : bureau, menu Démarrer, démarrage automatique de Windows
$shell = New-Object -ComObject WScript.Shell
$powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
function New-Raccourci($chemin, $script, $options, $description) {
  $r = $shell.CreateShortcut($chemin)
  if ($script -like '*.cmd') {
    $r.TargetPath = Join-Path $Cible $script
  } else {
    $r.TargetPath = $powershell
    $r.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$(Join-Path $Cible $script)`" $options".Trim()
    $r.WindowStyle = 7   # réduite : aucune fenêtre noire ne reste à l'écran
  }
  $r.WorkingDirectory = $Cible
  $r.IconLocation = Join-Path $Cible 'ndamely.ico'
  $r.Description = $description
  $r.Save()
}
$bureau  = [Environment]::GetFolderPath('CommonDesktopDirectory')
$menu    = Join-Path ([Environment]::GetFolderPath('CommonPrograms')) 'Ndamely'
$demarrage = [Environment]::GetFolderPath('CommonStartup')
New-Item -ItemType Directory -Force -Path $menu | Out-Null
New-Raccourci (Join-Path $bureau 'Ndamely.lnk') 'Ndamely.ps1' '' 'Ouvrir Ndamely'
New-Raccourci (Join-Path $menu 'Ndamely.lnk') 'Ndamely.ps1' '' 'Ouvrir Ndamely'
New-Raccourci (Join-Path $menu 'Arrêter Ndamely.lnk') 'Arreter-Ndamely.ps1' '' 'Arrêter Ndamely'
New-Raccourci (Join-Path $menu 'Désinstaller Ndamely.lnk') 'Desinstaller Ndamely.cmd' '' 'Désinstaller Ndamely (les données sont conservées)'
New-Raccourci (Join-Path $demarrage 'Ndamely.lnk') 'Ndamely.ps1' '-SansNavigateur' 'Démarrer Ndamely avec Windows'
Write-Host '  Raccourcis créés (bureau, menu Démarrer, démarrage de Windows)'

# 5. Pare-feu : autoriser les téléphones du Wi-Fi de l'école (réseaux privés seulement, jamais internet)
Get-NetFirewallRule -DisplayName 'Ndamely' -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -DisplayName 'Ndamely' -Description "Accès à Ndamely depuis le Wi-Fi de l'école" `
  -Direction Inbound -Protocol TCP -LocalPort $Port -Profile Private, Domain -Action Allow | Out-Null
Write-Host "  Pare-feu : port $Port ouvert sur les réseaux privés"

Write-Host ''
Write-Host '  Ndamely est installé. Il va s''ouvrir dans le navigateur.' -ForegroundColor Green
Write-Host "  Important : le Wi-Fi de l'école doit être déclaré « Réseau privé » dans Windows"
Write-Host '  (Paramètres > Réseau et Internet > Wi-Fi > propriétés du réseau) pour que les enseignants s''y connectent.'
Write-Host ''
Start-Process -FilePath (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe') `
  -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', "`"$Cible\Ndamely.ps1`""
Read-Host '  Appuyez sur Entrée pour fermer cette fenêtre'
