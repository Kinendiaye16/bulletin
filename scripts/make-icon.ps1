# Fabrique installer/windows/ndamely.ico à partir du dessin du logo (public/icon.svg), sans outil externe.
# Le logo est redessiné avec System.Drawing aux tailles 256, 48, 32 et 16 px (images PNG dans le fichier .ico).
param([string]$Sortie = (Join-Path $PSScriptRoot '..\installer\windows\ndamely.ico'))
Add-Type -AssemblyName System.Drawing

function New-LogoPng([int]$taille) {
  $bmp = New-Object System.Drawing.Bitmap $taille, $taille, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.Clear([System.Drawing.Color]::Transparent)
  $k = $taille / 64.0
  $Pt = { param($x, $y) New-Object System.Drawing.PointF ([single]($x * $k)), ([single]($y * $k)) }

  # Carré vert aux coins arrondis (rx = 15)
  $r = 15 * $k; $s = 64 * $k
  $fond = New-Object System.Drawing.Drawing2D.GraphicsPath
  $fond.AddArc(0, 0, 2 * $r, 2 * $r, 180, 90)
  $fond.AddArc($s - 2 * $r, 0, 2 * $r, 2 * $r, 270, 90)
  $fond.AddArc($s - 2 * $r, $s - 2 * $r, 2 * $r, 2 * $r, 0, 90)
  $fond.AddArc(0, $s - 2 * $r, 2 * $r, 2 * $r, 90, 90)
  $fond.CloseFigure()
  $g.FillPath((New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#0b6b3a'))), $fond)

  # Pages du livre ouvert
  function Add-Page($a, $b, $c, $d, $e, $f, $h, $i, $j) {
    $page = New-Object System.Drawing.Drawing2D.GraphicsPath
    $page.AddBezier((& $Pt $a[0] $a[1]), (& $Pt $b[0] $b[1]), (& $Pt $c[0] $c[1]), (& $Pt $d[0] $d[1]))
    $page.AddLine((& $Pt $d[0] $d[1]), (& $Pt $e[0] $e[1]))
    $page.AddBezier((& $Pt $e[0] $e[1]), (& $Pt $f[0] $f[1]), (& $Pt $h[0] $h[1]), (& $Pt $i[0] $i[1]))
    $page.CloseFigure()
    $g.FillPath((New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml($j))), $page)
  }
  Add-Page @(31, 49) @(25, 45) @(18, 44) @(11, 45) @(11, 27) @(18, 26) @(25, 27) @(31, 31) '#ffffff'
  Add-Page @(33, 49) @(39, 45) @(46, 44) @(53, 45) @(53, 27) @(46, 26) @(39, 27) @(33, 31) '#d9eadf'

  # Étoile dorée au-dessus du livre
  $etoile = @(0, -1, 0.247, -0.34, 0.951, -0.309, 0.399, 0.13, 0.588, 0.809, 0, 0.42, -0.588, 0.809, -0.399, 0.13, -0.951, -0.309, -0.247, -0.34)
  $pts = for ($n = 0; $n -lt $etoile.Count; $n += 2) { & $Pt (32 + 8 * $etoile[$n]) (15.5 + 8 * $etoile[$n + 1]) }
  $g.FillPolygon((New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#f2c94c'))), [System.Drawing.PointF[]]$pts)

  $g.Dispose()
  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  return ,$ms.ToArray()
}

$tailles = 256, 48, 32, 16
$images = foreach ($t in $tailles) { ,(New-LogoPng $t) }

# Fichier .ico : en-tête, une entrée par taille, puis les images PNG
$sortieFlux = New-Object System.IO.MemoryStream
$w = New-Object System.IO.BinaryWriter $sortieFlux
$w.Write([uint16]0); $w.Write([uint16]1); $w.Write([uint16]$tailles.Count)
$decalage = 6 + 16 * $tailles.Count
for ($n = 0; $n -lt $tailles.Count; $n++) {
  $t = $tailles[$n]; $png = $images[$n]
  $w.Write([byte]($(if ($t -ge 256) { 0 } else { $t }))); $w.Write([byte]($(if ($t -ge 256) { 0 } else { $t })))
  $w.Write([byte]0); $w.Write([byte]0); $w.Write([uint16]1); $w.Write([uint16]32)
  $w.Write([uint32]$png.Length); $w.Write([uint32]$decalage)
  $decalage += $png.Length
}
foreach ($png in $images) { $w.Write($png) }
$w.Flush()
[System.IO.File]::WriteAllBytes([System.IO.Path]::GetFullPath($Sortie), $sortieFlux.ToArray())
Write-Host "Icône créée : $Sortie ($($sortieFlux.Length) octets)"
