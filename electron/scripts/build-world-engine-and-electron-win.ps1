# Build world-engine-qt-shell (release + windeployqt), optional embed addon, then package Electron.
# Run from repo root or electron/ in PowerShell on a Windows host with Qt 6 MSVC + Rust installed.
param(
    [switch]$DirOnly,
    [switch]$SkipEmbed
)

$ErrorActionPreference = "Stop"
$electronDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not (Test-Path (Join-Path $electronDir "package.json"))) {
    $electronDir = Join-Path $electronDir "electron"
}
$repoRoot = Split-Path -Parent $electronDir

Write-Host "=== Building world-engine-qt-shell (release) ==="
& (Join-Path $repoRoot "native\world-engine-qt-shell\scripts\build-windows.ps1") -Release

Push-Location $electronDir
try {
    if (-not $SkipEmbed) {
        Write-Host "=== Building world-engine-electron-embed (release) ==="
        npm run build:native:embed
    } else {
        Write-Host "=== Skipping embed addon (-SkipEmbed) ==="
    }

    Write-Host "=== Staging world-engine for electron-builder ==="
    node scripts/stage-world-engine-win.mjs

    if ($DirOnly) {
        npm run build:win:dir
    } else {
        npm run build:win
    }
} finally {
    Pop-Location
}
