# Sinh lại asset nguồn và toàn bộ icon Android/iOS (chạy từ bất kỳ thư mục nào).
$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'generate-icon.ps1')
$mobileRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$projectPath = Join-Path $mobileRoot 'ios/Runner.xcodeproj/project.pbxproj'
$projectBefore = [System.IO.File]::ReadAllText($projectPath)

Push-Location $mobileRoot
try {
    dart run flutter_launcher_icons
    if ($LASTEXITCODE -ne 0) { throw 'flutter_launcher_icons failed.' }

    # flutter_launcher_icons 0.14.4 đổi nhầm các setting ASSETCATALOG khác thành AppIcon.
    # Khôi phục project gốc: tên catalog đã là AppIcon, chỉ asset ảnh cần được đổi.
    [System.IO.File]::WriteAllText($projectPath, $projectBefore, (New-Object System.Text.UTF8Encoding($false)))
}
finally { Pop-Location }
