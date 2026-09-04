#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== cargo test (domain crates) ==="
cargo test -p world-engine-core -p hardware-sim-core

echo "=== apps/workspace typecheck ==="
(cd apps/workspace && npm run typecheck)

echo "=== apps/workspace vitest (foundation modules) ==="
(cd apps/workspace && npx vitest run \
  src/shared/layoutSalvage.test.ts \
  src/shared/ebookState.test.ts \
  src/renderer/src/layout/layoutSession.test.ts \
  src/renderer/src/layout/layoutChipWindowDrop.test.ts \
  src/renderer/src/shortcuts/shortcutRegistry.test.ts)

echo "check: ok"
