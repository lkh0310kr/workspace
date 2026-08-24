#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
cargo build -p workspace-app
sh scripts/build-bundle.sh
