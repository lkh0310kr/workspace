# Build world-engine-qt-shell.exe on Windows (MSVC + Qt 6).
# Prerequisites:
#   - Rust (https://rustup.rs)
#   - Qt 6 Desktop MSVC 64-bit (https://www.qt.io/download)
#   - Visual Studio Build Tools with "Desktop development with C++"
#
# Usage (PowerShell):
#   cd native\world-engine-qt-shell
#   .\scripts\build-windows.ps1
#   .\scripts\build-windows.ps1 -Release

param(
    [switch]$Release
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$repoRoot = Split-Path -Parent (Split-Path -Parent $root)
$workspaceManifest = Join-Path $repoRoot "Cargo.toml"

if (-not $env:QT_INSTALL_PREFIX) {
    $candidates = @(
        "C:\Qt\6.8.3\msvc2022_64",
        "C:\Qt\6.8.2\msvc2022_64",
        "C:\Qt\6.8.1\msvc2022_64",
        "C:\Qt\6.8.0\msvc2022_64",
        "C:\Qt\6.7.3\msvc2022_64"
    )
    foreach ($c in $candidates) {
        if (Test-Path (Join-Path $c "bin\qmake.exe")) {
            $env:QT_INSTALL_PREFIX = $c
            break
        }
    }
}

if (-not $env:QT_INSTALL_PREFIX) {
    Write-Error "Set QT_INSTALL_PREFIX to your Qt 6 MSVC kit (e.g. C:\Qt\6.8.0\msvc2022_64)."
}

$profile = if ($Release) { "release" } else { "debug" }
Write-Host "Building $profile with QT_INSTALL_PREFIX=$env:QT_INSTALL_PREFIX"

if (Test-Path $workspaceManifest) {
    Set-Location $repoRoot
    if ($Release) {
        cargo build --release -p world-engine-qt-shell
    } else {
        cargo build -p world-engine-qt-shell
    }
    $exe = Join-Path $repoRoot "target\$profile\world-engine-qt-shell.exe"
} else {
    Set-Location $root
    if ($Release) {
        cargo build --release
    } else {
        cargo build
    }
    $exe = Join-Path $root "target\$profile\world-engine-qt-shell.exe"
}

if (-not (Test-Path $exe)) {
    Write-Error "Build failed — $exe not found."
}

$windeployqt = Join-Path $env:QT_INSTALL_PREFIX "bin\windeployqt.exe"
if (Test-Path $windeployqt) {
    Write-Host "Running windeployqt to copy Qt DLLs next to the exe..."
    & $windeployqt $exe
} else {
    Write-Warning "windeployqt not found — copy Qt6*.dll manually or add Qt\bin to PATH when running."
}

Write-Host "Done: $exe"
