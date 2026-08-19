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

# Now signed with a real "Developer ID Application" identity (Team
# B42SPPS3PR) instead of a personal "Apple Development" cert. The earlier
# attempts at hardened-runtime entitlements (see git history / this
# comment's prior version) made things *worse* — both the -67030 signature
# validation error and, separately, macOS's XProtect repeatedly quarantining
# the built .app as malware — and the common thread was always the signing
# identity, not the entitlements content: a personal Apple-Development cert
# is meant for local Xcode device debugging and doesn't carry the kind of
# Team-validated trust hardened-runtime entitlement checks, the sandbox, or
# XProtect actually check against. A Developer ID Application cert does.
#
# Each nested Mach-O gets its own entitlements (`entitlements/*.plist`,
# matching electron-osx-sign's per-helper-variant split) and must be signed
# innermost-first with `--options runtime` (hardened runtime — required for
# both correct entitlement enforcement and notarization) and `--timestamp`
# (required for notarization; skip only if genuinely offline).
sign_one() {
  local target="$1" entitlements="$2"
  codesign --force --options runtime --timestamp \
    --entitlements "$entitlements" \
    -s "$IDENTITY" "$target"
}

IDENTITY="$(security find-identity -v -p codesigning 2>/dev/null | grep -m1 'Developer ID Application' | sed -E 's/.*"(.*)"/\1/')"
APP="target/bundle/workspace-app.app"
FRAMEWORKS="$APP/Contents/Frameworks"
CEF_FW="$FRAMEWORKS/Chromium Embedded Framework.framework"

if [ -n "$IDENTITY" ]; then
  echo "Signing with Developer ID: $IDENTITY"
  for dylib in "$CEF_FW"/Libraries/*.dylib; do
    codesign --force --options runtime --timestamp -s "$IDENTITY" "$dylib"
  done
  codesign --force --options runtime --timestamp -s "$IDENTITY" "$CEF_FW"
  sign_one "$FRAMEWORKS/workspace-app Helper (GPU).app" entitlements/gpu.plist
  sign_one "$FRAMEWORKS/workspace-app Helper (Renderer).app" entitlements/renderer.plist
  sign_one "$FRAMEWORKS/workspace-app Helper (Plugin).app" entitlements/plugin.plist
  sign_one "$FRAMEWORKS/workspace-app Helper (Alerts).app" entitlements/alerts.plist
  sign_one "$FRAMEWORKS/workspace-app Helper.app" entitlements/main.plist
  sign_one "$APP" entitlements/main.plist

  if [ -n "${NOTARIZE:-}" ]; then
    echo "Notarizing (this takes a few minutes)..."
    ZIP="target/bundle/workspace-app-notarize.zip"
    rm -f "$ZIP"
    ditto -c -k --keepParent "$APP" "$ZIP"
    xcrun notarytool submit "$ZIP" --keychain-profile "workspace-app-notary" --wait
    xcrun stapler staple "$APP"
    rm -f "$ZIP"
  fi
else
  echo "No Developer ID Application identity found, falling back to ad-hoc/dev signing (expect -67030 / sandbox / XProtect issues)."
  DEV_IDENTITY="$(security find-identity -v -p codesigning 2>/dev/null | grep -m1 'Apple Development' | sed -E 's/.*"(.*)"/\1/')"
  if [ -n "$DEV_IDENTITY" ]; then
    codesign --deep --force -s "$DEV_IDENTITY" "$APP"
  else
    codesign --deep --force -s - "$APP"
  fi
fi

pkill -9 -f "target/bundle/workspace-app.app/Contents/MacOS/workspace-app" 2>/dev/null || true
sleep 0.5

LOG=/tmp/workspace-app-run.log
: > "$LOG"
open target/bundle/workspace-app.app --stdout "$LOG" --stderr "$LOG"
echo "Log: $LOG (tail -f $LOG to follow)"
