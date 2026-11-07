#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== apps/workspace-app typecheck ==="
(cd apps/workspace-app && npm run typecheck)

echo "=== apps/workspace-app vitest (foundation modules) ==="
(cd apps/workspace-app && npx vitest run \
  src/shared/layoutSalvage.test.ts \
  src/shared/ebookState.test.ts \
  src/renderer/src/layout/layoutSession.test.ts \
  src/renderer/src/layout/layoutChipWindowDrop.test.ts \
  src/renderer/src/shortcuts/shortcutRegistry.test.ts)

echo "check: ok"
