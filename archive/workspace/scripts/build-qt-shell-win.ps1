$ErrorActionPreference = "Stop"
$qtKit = "C:\Qt\__QT_VERSION__\msvc2022_64"
$buildDir = "C:\Users\__WIN_USER__\ws-build\world-engine\qt-shell"
$env:QT_INSTALL_PREFIX = $qtKit

$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
$ip = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (-not $ip) { throw "Visual Studio Build Tools not found" }
$vcvars = Join-Path $ip "VC\Auxiliary\Build\vcvars64.bat"
cmd /c "`"$vcvars`" && set" | ForEach-Object {
    if ($_ -match "^(.*?)=(.*)$") { Set-Item -Path "env:$($matches[1])" -Value $matches[2] }
}

Set-Location $buildDir
cargo build --release
& (Join-Path $qtKit "bin\windeployqt.exe") "target\release\world-engine-qt-shell.exe"
