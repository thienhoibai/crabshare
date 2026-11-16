# Vẽ icon vector bằng System.Drawing trên Windows, không cần tải ảnh hoặc font.
# Chạy từ bất kỳ thư mục nào: powershell -File mobile/tools/generate-icon.ps1
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$iconRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../assets/icon'))
New-Item -ItemType Directory -Force -Path $iconRoot | Out-Null

function New-CrabIcon([string]$destination, [bool]$transparent) {
    $bitmap = New-Object System.Drawing.Bitmap(1024, 1024)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $orange = [System.Drawing.ColorTranslator]::FromHtml('#F4925C')
    $ink = [System.Drawing.ColorTranslator]::FromHtml('#151413')
    $background = if ($transparent) { [System.Drawing.Color]::Transparent } else { $orange }
    $graphics.Clear($background)
    $brush = New-Object System.Drawing.SolidBrush($ink)
    $cutout = New-Object System.Drawing.SolidBrush($background)
    $pen = New-Object System.Drawing.Pen($ink, 32)
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    try {
        # Ba cặp chân, hai càng mở và hai mắt tạo silhouette rõ ở kích thước nhỏ.
        foreach ($side in @(-1, 1)) {
            foreach ($leg in @(@(520, 500, 510), @(570, 580, 615), @(615, 660, 705))) {
                $points = [System.Drawing.PointF[]]@(
                    (New-Object System.Drawing.PointF((512 + $side * 150), $leg[0])),
                    (New-Object System.Drawing.PointF((512 + $side * 225), $leg[1])),
                    (New-Object System.Drawing.PointF((512 + $side * 280), $leg[2]))
                )
                $graphics.DrawLines($pen, $points)
            }
            $graphics.DrawLine($pen, (512 + $side * 165), 490, (512 + $side * 250), 405)
            $graphics.DrawLine($pen, (512 + $side * 65), 440, (512 + $side * 75), 390)
            $graphics.FillEllipse($brush, (512 + $side * 75 - 24), 366, 48, 48)
        }
        $graphics.FillPie($brush, 172, 264, 180, 180, 0, 275)
        $graphics.FillPie($brush, 672, 264, 180, 180, 265, 275)
        $graphics.FillEllipse($brush, 322, 430, 380, 245)

        # Lỗ ở càng và nét cười trong suốt ở bản foreground/monochrome.
        $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
        $graphics.FillEllipse($cutout, 220, 312, 84, 84)
        $graphics.FillEllipse($cutout, 720, 312, 84, 84)
        $smile = New-Object System.Drawing.Pen($background, 18)
        $smile.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
        $smile.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
        try { $graphics.DrawArc($smile, 462, 535, 100, 55, 15, 150) }
        finally { $smile.Dispose() }
        $bitmap.Save($destination, [System.Drawing.Imaging.ImageFormat]::Png)
    }
    finally {
        $pen.Dispose()
        $brush.Dispose()
        $cutout.Dispose()
        $graphics.Dispose()
        $bitmap.Dispose()
    }
}

New-CrabIcon (Join-Path $iconRoot 'crabshare.png') $false
New-CrabIcon (Join-Path $iconRoot 'crabshare-foreground.png') $true
Write-Output "Icons generated in $iconRoot"
