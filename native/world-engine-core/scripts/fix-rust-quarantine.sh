#!/usr/bin/env bash
# macOS Gatekeeper quarantine on rustup toolchains can SIGKILL rustdoc during
# `cargo test` (doctest phase). Run once after toolchain install/update.
set -euo pipefail
TOOLCHAIN="${1:-stable-aarch64-apple-darwin}"
ROOT="${RUSTUP_HOME:-$HOME/.rustup}/toolchains/${TOOLCHAIN}"
if [[ ! -d "$ROOT" ]]; then
  echo "toolchain not found: $ROOT" >&2
  exit 1
fi
xattr -dr com.apple.quarantine "$ROOT" 2>/dev/null || true
echo "cleared quarantine on $ROOT"
