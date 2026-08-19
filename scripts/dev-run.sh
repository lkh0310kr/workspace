#!/usr/bin/env bash
# CEF 통합 중에는 raw `cargo run`이 안 됩니다 — CEF가 Frameworks/Helpers를
# 포함한 정식 .app 번들 구조를 요구합니다 (target/debug 바이너리를 직접
# 실행하면 library_loader.rs에서 패닉납니다).
set -euo pipefail
cd "$(dirname "$0")/.."

export CEF_PATH="${CEF_PATH:-$HOME/.local/share/cef}"

if [ ! -d "$CEF_PATH" ]; then
  echo "CEF binary not found at $CEF_PATH — downloading (one-time, ~350MB)..."
  cargo run -p export-cef-dir -- --force "$CEF_PATH" 2>/dev/null || {
    echo "This needs the cef-rs repo cloned for export-cef-dir. Run:"
    echo "  git clone --depth 1 https://github.com/tauri-apps/cef-rs ref-proj/cef-rs"
    echo "  (cd ref-proj/cef-rs && cargo run -p export-cef-dir -- --force \"$CEF_PATH\")"
    exit 1
  }
fi

command -v bundle-cef-app >/dev/null || cargo install cef --bin bundle-cef-app --features build-util
command -v cmake >/dev/null || { echo "brew install cmake ninja"; exit 1; }

bundle-cef-app workspace-app -o target/bundle

# Adhoc (`-s -`) was what got OSR CEF working end-to-end earlier, but with
# *windowed* CEF (a real NSView, GPU-composited, talking to WindowServer)
# the process keeps logging "Unable to derive validation category... -67030"
# and the app has been dying with no crash report (implying SIGKILL, not a
# catchable crash) during real interaction (typing/navigating) — plausibly
# macOS's process-validation objecting to adhoc signing once the process
# actually touches WindowServer, which OSR never did. Testing a real local
# identity here again now that the *reason* it broke things before (renderer
# helper spawn failing under multi-process validation) may not apply the
# same way to windowed mode.
IDENTITY="$(security find-identity -v -p codesigning 2>/dev/null | grep -m1 'Apple Development' | sed -E 's/.*"(.*)"/\1/')"
if [ -n "$IDENTITY" ]; then
  codesign --deep --force -s "$IDENTITY" target/bundle/workspace-app.app
else
  codesign --deep --force -s - target/bundle/workspace-app.app
fi

pkill -9 -f "target/bundle/workspace-app.app/Contents/MacOS/workspace-app" 2>/dev/null || true
sleep 0.5

LOG=/tmp/workspace-app-run.log
: > "$LOG"
open target/bundle/workspace-app.app --stdout "$LOG" --stderr "$LOG"
echo "Log: $LOG (tail -f $LOG to follow)"
