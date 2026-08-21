# Generates public/og-image.png from the real Fitline logo + Raleway wordmark.
# Run: powershell -File scripts/make-og.ps1

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Split-Path (Split-Path $PSScriptRoot -Parent) -ErrorAction SilentlyContinue
if (-not $root) { $root = Resolve-Path (Join-Path $PSScriptRoot '..') }
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

$logoPath = Join-Path $root 'public\assets\images\logo\fitline-logo.png'
$fontPath = Join-Path $root 'scripts\fonts\Raleway.ttf'
$outPath = Join-Path $root 'public\og-image.png'

$w = 1200
$h = 630
$bmp = New-Object System.Drawing.Bitmap $w, $h
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

# Site light background
$bg = [System.Drawing.Color]::FromArgb(255, 255, 255, 255)
$g.Clear($bg)

# Soft blue wash (brand blue #0000FF) bottom-right
$wash = New-Object System.Drawing.Drawing2D.LinearGradientBrush (
  (New-Object System.Drawing.Point 700, 80),
  (New-Object System.Drawing.Point 1200, 630),
  [System.Drawing.Color]::FromArgb(28, 0, 0, 255),
  [System.Drawing.Color]::FromArgb(0, 255, 255, 255)
)
$g.FillRectangle($wash, 0, 0, $w, $h)
$wash.Dispose()

# Soft green accent blob (#ABFB4F)
$greenBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(40, 171, 251, 79))
$g.FillEllipse($greenBrush, 980, 420, 280, 280)
$greenBrush.Dispose()

# Load private font
$fonts = New-Object System.Drawing.Text.PrivateFontCollection
$fonts.AddFontFile($fontPath)
$family = $fonts.Families[0]

$logo = [System.Drawing.Image]::FromFile($logoPath)
$logoSize = 112
$padX = 96
$padY = 210
$g.DrawImage($logo, $padX, $padY, $logoSize, $logoSize)

# Wordmark "Fitline" beside logo
$titleBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 0, 0, 0))
$titleFont = New-Object System.Drawing.Font($family, 72, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$wordX = $padX + $logoSize + 28
$wordY = $padY + 18
$g.DrawString('Fitline', $titleFont, $titleBrush, $wordX, $wordY)

# Tagline
$tagBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 55, 65, 75))
$tagFont = New-Object System.Drawing.Font($family, 34, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$tagY = $padY + $logoSize + 36
$g.DrawString('Get the interview for the job you want.', $tagFont, $tagBrush, $padX, $tagY)

# Accent underline under brand row (blue)
$linePen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 0, 0, 255), 4)
$g.DrawLine($linePen, $padX, $tagY - 16, $padX + 420, $tagY - 16)

$bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)

$linePen.Dispose()
$tagFont.Dispose()
$tagBrush.Dispose()
$titleFont.Dispose()
$titleBrush.Dispose()
$logo.Dispose()
$fonts.Dispose()
$g.Dispose()
$bmp.Dispose()

Write-Output "Wrote $outPath"
