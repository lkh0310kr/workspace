# Install Visual Studio 2022 Build Tools (C++ workload) unattended.
# Run in Windows PowerShell as Administrator:
#   powershell -ExecutionPolicy Bypass -File install-vs-build-tools.ps1

$ErrorActionPreference = "Stop"

$installer = Join-Path $env:TEMP "vs_BuildTools.exe"
$url = "https://aka.ms/vs/17/release/vs_buildtools.exe"

if (-not (Test-Path $installer)) {
    Write-Host "Downloading vs_BuildTools.exe..."
    Invoke-WebRequest -Uri $url -OutFile $installer -UseBasicParsing
}

Write-Host "Installing MSVC Build Tools (quiet, 10-20 min)..."
$args = @(
    "--quiet",
    "--wait",
    "--norestart",
    "--nocache",
    "--add", "Microsoft.VisualStudio.Workload.VCTools",
    "--includeRecommended"
)

$p = Start-Process -FilePath $installer -ArgumentList $args -Wait -PassThru
if ($p.ExitCode -ne 0) {
    Write-Error "vs_BuildTools.exe failed with exit code $($p.ExitCode)"
}
Write-Host "Done. cl.exe should be available after opening a new terminal."
