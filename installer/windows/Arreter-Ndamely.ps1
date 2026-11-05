# Arrête Ndamely (le serveur qui tourne en arrière-plan). Les données ne sont pas touchées.
$Node = Join-Path $PSScriptRoot 'node\node.exe'
$procs = Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $Node }
if ($procs) {
  $procs | Stop-Process -Force
  Write-Host 'Ndamely est arrêté.'
} else {
  Write-Host "Ndamely n'était pas lancé."
}
Start-Sleep -Seconds 2
