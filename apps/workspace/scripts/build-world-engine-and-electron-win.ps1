# Build world-engine-qt-shell (release + windeployqt), then package Electron.
# Run from apps/workspace/scripts in PowerShell on a Windows host with Qt 6 MSVC + Rust installed.
param(
    [switch]$DirOnly
)

$ErrorActionPreference = "Stop"
$scriptsDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$electronDir = Split-Path -Parent $scriptsDir
if (-not (Test-Path (Join-Path $electronDir "package.json"))) {
    throw "Expected apps/workspace/package.json next to scripts/"
}
$repoRoot = Split-Path -Parent (Split-Path -Parent $electronDir)

Write-Host "=== Building world-engine-qt-shell (release) ==="
& (Join-Path $repoRoot "world-engine\qt-shell\scripts\build-windows.ps1") -Release

Push-Location $electronDir
try {
    Write-Host "=== Staging world-engine for electron-builder ==="
    node scripts/stage-world-engine-win.mjs

    if ($DirOnly) {
        npm run build:win:dir
    } else {
        npm run build:win
    }
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
    Pop-Location
}
