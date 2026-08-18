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
codesign --deep --force -s - target/bundle/workspace-app.app
open target/bundle/workspace-app.app
