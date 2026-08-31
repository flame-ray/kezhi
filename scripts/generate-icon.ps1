param(
  [string]$OutputDirectory = (Join-Path $PSScriptRoot "..\src-tauri\icons")
)

Add-Type -AssemblyName System.Drawing

function New-RoundedPath([System.Drawing.RectangleF]$Bounds, [float]$Radius) {
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $diameter = $Radius * 2
  $path.AddArc($Bounds.X, $Bounds.Y, $diameter, $diameter, 180, 90)
  $path.AddArc($Bounds.Right - $diameter, $Bounds.Y, $diameter, $diameter, 270, 90)
  $path.AddArc($Bounds.Right - $diameter, $Bounds.Bottom - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($Bounds.X, $Bounds.Bottom - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$bitmap = [System.Drawing.Bitmap]::new(512, 512, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([System.Drawing.Color]::Transparent)

$tile = New-RoundedPath ([System.Drawing.RectangleF]::new(28, 28, 456, 456)) 104
$tileBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
  [System.Drawing.RectangleF]::new(28, 28, 456, 456),
  [System.Drawing.Color]::FromArgb(255, 250, 251, 255),
  [System.Drawing.Color]::FromArgb(255, 226, 231, 255),
  52
)
$graphics.FillPath($tileBrush, $tile)

$graphics.TranslateTransform(256, 256)
$graphics.RotateTransform(38)
$bars = @(
  @{ X = -128; Y = -174; W = 74; H = 348; R = 37; C = [System.Drawing.Color]::FromArgb(255, 79, 99, 217) },
  @{ X = -37; Y = -148; W = 74; H = 296; R = 37; C = [System.Drawing.Color]::FromArgb(255, 94, 190, 179) },
  @{ X = 54; Y = -174; W = 74; H = 348; R = 37; C = [System.Drawing.Color]::FromArgb(255, 232, 132, 105) }
)
foreach ($bar in $bars) {
  $path = New-RoundedPath ([System.Drawing.RectangleF]::new($bar.X, $bar.Y, $bar.W, $bar.H)) $bar.R
  $brush = [System.Drawing.SolidBrush]::new($bar.C)
  $graphics.FillPath($brush, $path)
  $brush.Dispose()
  $path.Dispose()
}
$graphics.ResetTransform()

$pngPath = Join-Path $OutputDirectory "icon.png"
$bitmap.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)
$tileBrush.Dispose()
$tile.Dispose()
$graphics.Dispose()
$bitmap.Dispose()

Write-Output $pngPath
