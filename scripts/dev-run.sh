#!/usr/bin/env bash
# Builds a minimal .app bundle (no CEF — removed; see git history) and
# launches it. A bare `cargo run` binary works fine now that nothing needs
# the Frameworks/Helpers structure CEF required, but a real .app bundle
# still gets us a proper icon, bundle identifier, and Dock behavior.
set -euo pipefail
cd "$(dirname "$0")/.."

cargo build -p workspace-app

APP="target/bundle/workspace-app.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp target/debug/workspace-app "$APP/Contents/MacOS/workspace-app"
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

# Real "Developer ID Application" identity (Team B42SPPS3PR) when available
# — a personal "Apple Development" cert or ad-hoc signing both trip
# Gatekeeper/XProtect far more readily on this machine (confirmed
# repeatedly, not assumed).
IDENTITY="$(security find-identity -v -p codesigning 2>/dev/null | grep -m1 'Developer ID Application' | sed -E 's/.*"(.*)"/\1/')"
if [ -n "$IDENTITY" ]; then
  echo "Signing with Developer ID: $IDENTITY"
  codesign --force --options runtime --timestamp --entitlements entitlements/main.plist -s "$IDENTITY" "$APP"
else
  echo "No Developer ID Application identity found, falling back to ad-hoc signing."
  DEV_IDENTITY="$(security find-identity -v -p codesigning 2>/dev/null | grep -m1 'Apple Development' | sed -E 's/.*"(.*)"/\1/')"
  codesign --force -s "${DEV_IDENTITY:--}" "$APP"
fi

pkill -9 -f "target/bundle/workspace-app.app/Contents/MacOS/workspace-app" 2>/dev/null || true
sleep 0.5

LOG=/tmp/workspace-app-run.log
: > "$LOG"
open "$APP" --stdout "$LOG" --stderr "$LOG"
echo "Log: $LOG (tail -f $LOG to follow)"
