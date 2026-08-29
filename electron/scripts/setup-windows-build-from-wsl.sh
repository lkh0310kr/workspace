#!/usr/bin/env bash
# Orchestrate Windows MSVC + Qt install and world-engine-qt-shell build from WSL.
# Logs: /mnt/c/Users/<winuser>/workspace-windows-setup.log
#
#   bash electron/scripts/setup-windows-build-from-wsl.sh
#   SKIP_QT=1 bash electron/scripts/setup-windows-build-from-wsl.sh   # Qt already installed
set -euo pipefail

WIN_USER="${WIN_USER:-14ZB990}"
WIN_HOME="/mnt/c/Users/${WIN_USER}"
LOG="${WIN_HOME}/workspace-windows-setup.log"
BUILD_ROOT="${WIN_HOME}/ws-build"
QT_VERSION="6.8.3"
REPO="/home/lkh0310kr/workspace"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "[$(date +%H:%M:%S)] === Workspace Windows build from WSL ===" | tee -a "$LOG"

echo "[$(date +%H:%M:%S)] Installing aqtinstall..." | tee -a "$LOG"
cmd.exe /c "cd /d C:\\Users\\${WIN_USER} && python -m pip install -q aqtinstall" 2>&1 | tr -d '\r' | tee -a "$LOG"

if [[ "${SKIP_QT:-0}" != "1" ]] && [[ ! -f "/mnt/c/Qt/${QT_VERSION}/msvc2022_64/bin/qmake.exe" ]]; then
  echo "[$(date +%H:%M:%S)] Installing Qt ${QT_VERSION} to C:\\Qt..." | tee -a "$LOG"
  cmd.exe /c "cd /d C:\\Users\\${WIN_USER} && if not exist C:\\Qt mkdir C:\\Qt && aqt install-qt windows desktop ${QT_VERSION} win64_msvc2022_64 -O C:\\Qt" 2>&1 | tr -d '\r' | tee -a "$LOG"
else
  echo "[$(date +%H:%M:%S)] Qt already installed" | tee -a "$LOG"
fi

if [[ "${SKIP_VS:-0}" != "1" ]] && ! cmd.exe /c "cd /d C:\\Users\\${WIN_USER} && where cl" 2>&1 | tr -d '\r' | grep -qi 'cl\.exe'; then
  echo "[$(date +%H:%M:%S)] Installing VS Build Tools (UAC prompt may appear on Windows)..." | tee -a "$LOG"
  cp "${SCRIPT_DIR}/install-vs-build-tools.cmd" "${WIN_HOME}/install-vs-build-tools.cmd"
  if ! cmd.exe /c "cd /d C:\\Users\\${WIN_USER} && install-vs-build-tools.cmd" 2>&1 | tr -d '\r' | tee -a "$LOG"; then
    echo "[$(date +%H:%M:%S)] WARNING: VS Build Tools install failed (exit 1602 = UAC cancelled?)." | tee -a "$LOG"
    echo "[$(date +%H:%M:%S)] Run in Windows PowerShell AS ADMIN: winget install -e --id Microsoft.VisualStudio.2022.BuildTools --override \"--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended\"" | tee -a "$LOG"
    exit 1
  fi
else
  echo "[$(date +%H:%M:%S)] MSVC already available" | tee -a "$LOG"
fi

echo "[$(date +%H:%M:%S)] Syncing native/ to ${BUILD_ROOT}..." | tee -a "$LOG"
mkdir -p "${BUILD_ROOT}"
rsync -a --delete "${REPO}/native/" "${BUILD_ROOT}/native/"

sed "s/__QT_VERSION__/${QT_VERSION}/g; s/__WIN_USER__/${WIN_USER}/g" \
  "${SCRIPT_DIR}/build-qt-shell-win.ps1" > "${WIN_HOME}/build-qt-shell.ps1"

echo "[$(date +%H:%M:%S)] Building release..." | tee -a "$LOG"
cmd.exe /c "cd /d C:\\Users\\${WIN_USER} && powershell -NoProfile -ExecutionPolicy Bypass -File C:\\Users\\${WIN_USER}\\build-qt-shell.ps1" 2>&1 | tr -d '\r' | tee -a "$LOG"

EXE_WSL="${BUILD_ROOT}/native/world-engine-qt-shell/target/release/world-engine-qt-shell.exe"
DEST="${REPO}/native/world-engine-qt-shell/target/release"

if [[ ! -f "$EXE_WSL" ]]; then
  echo "[$(date +%H:%M:%S)] ERROR: missing $EXE_WSL" | tee -a "$LOG"
  exit 1
fi

mkdir -p "$DEST"
rsync -a "${BUILD_ROOT}/native/world-engine-qt-shell/target/release/" "$DEST/"
echo "[$(date +%H:%M:%S)] SUCCESS: ${DEST}/world-engine-qt-shell.exe" | tee -a "$LOG"
