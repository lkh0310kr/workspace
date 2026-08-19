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

# A real local identity (not adhoc `-s -`) is what got windowed CEF stable —
# adhoc made "Unable to derive validation category... -67030" fatal (silent
# SIGKILL) once the process actually talks to WindowServer, which OSR never
# did.
#
# Deliberately no `--entitlements` here. Tried two variants — one blanket
# `--deep --entitlements` with a broad plist, one with electron-osx-sign's
# actual production-proven per-helper-variant split
# (https://github.com/electron-userland/electron-osx-sign/tree/main/entitlements,
# targeting the real V8 SIGSEGV crash report's JIT-memory-protection cause)
# — and *both* made the app die silently (no crash report) within seconds
# of every launch, even with zero user interaction. Conclusion: it's not
# the plist contents, it's that a personal "Apple Development" identity
# (meant for local Xcode debugging on your own devices) isn't the kind of
# signing identity hardened-runtime entitlements actually validate against
# — that needs a real Developer ID Application cert plus notarization,
# which is a release pipeline, not a dev-script flag. Left in
# entitlements/*.plist for whenever that exists.
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
