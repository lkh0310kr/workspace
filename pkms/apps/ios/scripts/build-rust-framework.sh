#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
IOS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ROOT_DIR="$(cd "$IOS_DIR/../.." && pwd)"
FRAMEWORKS_DIR="$IOS_DIR/Frameworks"
RUST_TARGET_DIR="$ROOT_DIR/target/pkms-ios"

if ! command -v cargo >/dev/null 2>&1; then
  echo "Rust is required. Install rustup, then run: rustup target add aarch64-apple-ios aarch64-apple-ios-sim" >&2
  exit 1
fi

rustup target add aarch64-apple-ios aarch64-apple-ios-sim
CARGO_TARGET_DIR="$RUST_TARGET_DIR" cargo build --manifest-path "$ROOT_DIR/Cargo.toml" -p pkms-ffi --release --target aarch64-apple-ios
CARGO_TARGET_DIR="$RUST_TARGET_DIR" cargo build --manifest-path "$ROOT_DIR/Cargo.toml" -p pkms-ffi --release --target aarch64-apple-ios-sim

rm -rf "$FRAMEWORKS_DIR/PKMSRustFFI.xcframework"
mkdir -p "$FRAMEWORKS_DIR"
xcodebuild -create-xcframework \
  -library "$RUST_TARGET_DIR/aarch64-apple-ios/release/libpkms_ffi.a" -headers "$IOS_DIR/Native/include" \
  -library "$RUST_TARGET_DIR/aarch64-apple-ios-sim/release/libpkms_ffi.a" -headers "$IOS_DIR/Native/include" \
  -output "$FRAMEWORKS_DIR/PKMSRustFFI.xcframework"
