# One-time Windows host setup: MSVC Build Tools + Qt 6 + world-engine-qt-shell release build.
# Run in Windows PowerShell (not WSL).
#
#   cd \\wsl.localhost\Ubuntu\home\<user>\workspace\electron
#   .\scripts\setup-windows-build.ps1
#
# Or from anywhere (script copied to Desktop, etc.):
#   .\setup-windows-build.ps1 -RepoRoot \\wsl.localhost\Ubuntu\home\<user>\workspace
#
# Options:
#   -RepoRoot           Workspace root (auto-detected when run from electron\scripts\)
#   -SkipVsBuildTools   Skip VS Build Tools winget install (if already present)
#   -SkipQt             Skip Qt download (if QT_INSTALL_PREFIX already set)
#   -BuildOnly          Skip installs; only build qt-shell release

param(
    [string]$RepoRoot = "",
    [switch]$SkipVsBuildTools,
    [switch]$SkipQt,
    [switch]$BuildOnly
)

$ErrorActionPreference = "Stop"

function Test-MsvcCl {
    return $null -ne (Get-Command cl.exe -ErrorAction SilentlyContinue)
}

function Import-VsDevEnvironment {
    $vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
    if (-not (Test-Path $vswhere)) { return $false }
    $installPath = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
    if (-not $installPath) { return $false }
    $vcvars = Join-Path $installPath "VC\Auxiliary\Build\vcvars64.bat"
    if (-not (Test-Path $vcvars)) { return $false }
    cmd /c "`"$vcvars`" && set" | ForEach-Object {
        if ($_ -match "^(.*?)=(.*)$") { Set-Item -Path "env:$($matches[1])" -Value $matches[2] }
    }
    return Test-MsvcCl
}

function Resolve-RepoRoot([string]$hint, [string]$scriptDir) {
    if ($hint -and (Test-Path (Join-Path $hint "electron\package.json"))) {
        return $hint
    }
    if ($scriptDir -and $scriptDir -match 'electron[\\/]scripts$') {
        $fromScript = Split-Path -Parent (Split-Path -Parent $scriptDir)
        if (Test-Path (Join-Path $fromScript "electron\package.json")) {
            return $fromScript
        }
    }
    $wslUser = $env:USERNAME
    if (-not $wslUser) { $wslUser = "lkh0310kr" }
    $candidates = @(
        "\\wsl.localhost\Ubuntu\home\$wslUser\workspace",
        "\\wsl$\Ubuntu\home\$wslUser\workspace"
    )
    foreach ($c in $candidates) {
        if (Test-Path (Join-Path $c "electron\package.json")) { return $c }
    }
    throw "Cannot find workspace root. Pass -RepoRoot (e.g. \\wsl.localhost\Ubuntu\home\you\workspace)."
}

$scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
$repoRoot = Resolve-RepoRoot $RepoRoot $scriptDir
$qtRoot = "C:\Qt"
$qtVersion = "6.8.3"
$qtKit = Join-Path $qtRoot "$qtVersion\msvc2022_64"
$logFile = Join-Path $env:USERPROFILE "workspace-windows-setup.log"

function Log([string]$msg) {
    $line = "[$(Get-Date -Format 'HH:mm:ss')] $msg"
    Write-Host $line
    Add-Content -Path $logFile -Value $line
}

Log "RepoRoot=$repoRoot"
Push-Location $repoRoot
try {
    if (-not $BuildOnly) {
        if (-not $SkipVsBuildTools -and -not (Test-MsvcCl)) {
            Log "=== Installing Visual Studio 2022 Build Tools (C++ workload) ==="
            Log "This can take 10-20 minutes..."
            Write-Host "Running install-vs-build-tools.ps1 (quiet, not winget passive)..."
            & (Join-Path $scriptDir "install-vs-build-tools.ps1")
        }

        if (-not (Import-VsDevEnvironment)) {
            throw "MSVC cl.exe not found. Install 'Desktop development with C++' and re-run."
        }
        Log "MSVC ready: $((Get-Command cl.exe).Source)"

        if (-not $SkipQt -and -not (Test-Path (Join-Path $qtKit "bin\qmake.exe"))) {
            Log "=== Installing Qt $qtVersion MSVC via aqtinstall ==="
            python -m pip install -q aqtinstall
            if (-not (Test-Path $qtRoot)) { New-Item -ItemType Directory -Path $qtRoot | Out-Null }
            aqt install-qt windows desktop $qtVersion win64_msvc2022_64 -O $qtRoot
        }
    } else {
        if (-not (Import-VsDevEnvironment)) {
            Log "WARNING: vcvars not loaded — build may fail if cl.exe is not on PATH."
        }
    }

    if (-not (Test-Path (Join-Path $qtKit "bin\qmake.exe"))) {
        throw "Qt not found at $qtKit. Re-run without -SkipQt or set QT_INSTALL_PREFIX."
    }
    $env:QT_INSTALL_PREFIX = $qtKit
    Log "QT_INSTALL_PREFIX=$env:QT_INSTALL_PREFIX"

    Log "=== Building world-engine-qt-shell (release) ==="
    & (Join-Path $repoRoot "native\world-engine-qt-shell\scripts\build-windows.ps1") -Release

    $exe = Join-Path $repoRoot "native\world-engine-qt-shell\target\release\world-engine-qt-shell.exe"
    if (Test-Path $exe) {
        Log "SUCCESS: $exe"
        Log "Smoke test: & '$exe'"
        Log "WSL dev: cd ~/workspace/electron && npm run dev -> Open in World Engine"
    } else {
        throw "Build finished but exe missing: $exe"
    }
} catch {
    Log "ERROR: $_"
    throw
} finally {
    Pop-Location
}
