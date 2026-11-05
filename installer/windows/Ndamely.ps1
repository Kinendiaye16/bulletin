# Lanceur de Ndamely : démarre le serveur en arrière-plan (s'il ne tourne pas déjà), puis ouvre le navigateur.
#   -SansNavigateur : démarre seulement le serveur (utilisé au démarrage de Windows).
param([switch]$SansNavigateur)

$ErrorActionPreference = 'Stop'
$Racine  = $PSScriptRoot
$Node    = Join-Path $Racine 'node\node.exe'
$Serveur = Join-Path $Racine 'app\server\index.js'
$Donnees = Join-Path $env:ProgramData 'Ndamely'
$Port    = 4500
$Adresse = "http://localhost:$Port"

function Test-Ndamely {
  try {
    Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 "$Adresse/api/installation" | Out-Null
    return $true
  } catch {
    # 401 / 403 : le serveur répond, il tourne donc déjà.
    return [bool]$_.Exception.Response
  }
}

if (-not (Test-Ndamely)) {
  New-Item -ItemType Directory -Force -Path $Donnees | Out-Null
  $env:NDAMELY_DATA = $Donnees
  $env:PORT = "$Port"
  Start-Process -FilePath $Node `
    -ArgumentList '--disable-warning=ExperimentalWarning', "`"$Serveur`"" `
    -WorkingDirectory (Join-Path $Racine 'app') `
    -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $Donnees 'ndamely.log') `
    -RedirectStandardError (Join-Path $Donnees 'ndamely-erreurs.log')
  # Attendre que Ndamely réponde (15 secondes au plus)
  for ($i = 0; $i -lt 30 -and -not (Test-Ndamely); $i++) { Start-Sleep -Milliseconds 500 }
}

if (-not $SansNavigateur) { Start-Process $Adresse }
