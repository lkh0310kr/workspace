#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== apps/desktop typecheck ==="
(cd apps/desktop && npm run typecheck)

echo "=== shared editor tree architecture contract ==="
node scripts/check-editor-tree-contract.mjs

echo "=== apps/desktop vitest (foundation modules) ==="
(cd apps/desktop && npx vitest run \
  src/shared/layoutSalvage.test.ts \
  src/shared/ebookState.test.ts \
  src/renderer/src/layout/layoutSession.test.ts \
  src/renderer/src/layout/layoutChipWindowDrop.test.ts \
  src/renderer/src/shortcuts/shortcutRegistry.test.ts)

echo "check: ok"
