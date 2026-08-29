$ErrorActionPreference = "Stop"
$qtKit = "C:\Qt\__QT_VERSION__\msvc2022_64"
$buildDir = "C:\Users\__WIN_USER__\ws-build\native\world-engine-qt-shell"
$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
$ip = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
$vcvars = Join-Path $ip "VC\Auxiliary\Build\vcvars64.bat"
cmd /c "`"$vcvars`" && set QT_INSTALL_PREFIX=$qtKit && cd /d $buildDir && cargo build --release && $qtKit\bin\windeployqt.exe target\release\world-engine-qt-shell.exe"
