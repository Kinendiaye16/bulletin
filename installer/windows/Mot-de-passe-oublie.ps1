# Mot de passe oublié, sans code de secours : à lancer sur l'ordinateur de l'école.
# Donne un mot de passe provisoire au compte choisi.
$Node    = Join-Path $PSScriptRoot 'node\node.exe'
$Script  = Join-Path $PSScriptRoot 'app\server\reset-password.js'
$env:NDAMELY_DATA = Join-Path $env:ProgramData 'Ndamely'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host ''
Write-Host '  Ndamely - mot de passe oublié' -ForegroundColor Green
Write-Host ''
& $Node --disable-warning=ExperimentalWarning $Script
Write-Host ''
$email = Read-Host '  Adresse e-mail du compte (ou Entrée pour annuler)'
if ($email) {
  Write-Host ''
  & $Node --disable-warning=ExperimentalWarning $Script $email
}
Write-Host ''
Read-Host '  Appuyez sur Entrée pour fermer cette fenêtre'
