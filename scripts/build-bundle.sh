#!/usr/bin/env bash
# Assemble target/bundle/workspace-app.app from a freshly built debug binary.
set -euo pipefail
cd "${WORKSPACE_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
ROOT="$(pwd)"

APP="${APP:-target/bundle/workspace-app.app}"
# Caller may have already removed a prior bundle (dev-run stops the app first).
rm -rf "$APP" 2>/dev/null || true
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "${CARGO_TARGET_DIR:-$ROOT/target}/debug/workspace-app" "$APP/Contents/MacOS/workspace-app"
cp icons/icon.icns "$APP/Contents/Resources/icon.icns"

cat > "$APP/Contents/Info.plist" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>workspace-app</string>
  <key>CFBundleIconFile</key>
  <string>icon.icns</string>
  <key>CFBundleIdentifier</key>
  <string>com.workspace.app</string>
  <key>CFBundleName</key>
  <string>Workspace</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>0.1.0</string>
  <key>LSMinimumSystemVersion</key>
  <string>11.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
EOF

IDENTITY="$(security find-identity -v -p codesigning 2>/dev/null | grep -m1 'Developer ID Application' | sed -E 's/.*"(.*)"/\1/')"
if [ -n "$IDENTITY" ]; then
  echo "Signing with Developer ID: $IDENTITY"
  codesign --force --options runtime --timestamp --entitlements entitlements/main.plist -s "$IDENTITY" "$APP"
else
  echo "No Developer ID Application identity found, falling back to ad-hoc signing."
  DEV_IDENTITY="$(security find-identity -v -p codesigning 2>/dev/null | grep -m1 'Apple Development' | sed -E 's/.*"(.*)"/\1/')"
  codesign --force -s "${DEV_IDENTITY:--}" "$APP"
fi

# Files touched from workspace-app tmux inherit com.apple.quarantine from
# workspace-app as responsible process; strip so Gatekeeper doesn't block dev
# relaunches or child processes (cargo, tmux, etc.).
xattr -dr com.apple.quarantine "$APP" "${CARGO_TARGET_DIR:-$ROOT/target}/debug" "$ROOT/target/debug" 2>/dev/null || true
