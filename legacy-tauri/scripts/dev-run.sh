#!/usr/bin/env bash
# Builds a minimal .app bundle (no CEF — removed; see git history) and
# launches it. A bare `cargo run` binary works fine now that nothing needs
# the Frameworks/Helpers structure CEF required, but a real .app bundle
# still gets us a proper icon, bundle identifier, and Dock behavior.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"

in_workspace_tmux() {
  [[ -n "${TMUX:-}" ]] &&
    tmux display-message -p '#{session_name}' 2>/dev/null | grep -qE '^workspace-term-'
}

run_via_launchd() {
  local cmd="$1"
  local label="workspace.devbuild.$$"
  local log exit_file code
  log="$(mktemp /tmp/workspace-devbuild.XXXXXX)"
  exit_file="/tmp/workspace-devbuild.$$.$RANDOM.exit"
  rm -f "$exit_file"
  launchctl submit -l "$label" -o "$log" -e "$log" -- /bin/zsh -lc \
    "cd '$ROOT' && $cmd; echo \$? > '$exit_file'"
  for _ in $(seq 1 300); do
    [[ -f "$exit_file" ]] && break
    sleep 1
  done
  if [[ ! -f "$exit_file" ]]; then
    echo "Build timed out after 5 minutes. Log: $log" >&2
    exit 1
  fi
  code="$(cat "$exit_file")"
  rm -f "$exit_file"
  launchctl remove "$label" 2>/dev/null || true
  if [[ "$code" != "0" ]]; then
    cat "$log" >&2
    rm -f "$log"
    exit "$code"
  fi
  rm -f "$log"
}

stop_workspace_app() {
  # Kill every workspace-app instance, including AppTranslocation copies
  # launched by `open` from an earlier dev-run — the old pkill path-only
  # pattern missed those and left EBUSY on relaunch.
  pkill -9 -x workspace-app 2>/dev/null || true
  pkill -9 -f 'workspace-app.app/Contents/MacOS/workspace-app' 2>/dev/null || true
  for _ in $(seq 1 40); do
    pgrep -x workspace-app >/dev/null || return 0
    sleep 0.25
  done
  echo "warning: workspace-app did not exit; launch may fail" >&2
}

APP="target/bundle/workspace-app.app"
LAUNCH_APP="/tmp/workspace-app-dev.app"
CARGO_TARGET_DIR="/tmp/workspace-app-target"

stop_workspace_app
xattr -dr com.apple.quarantine "$ROOT/target" "$LAUNCH_APP" "$CARGO_TARGET_DIR" 2>/dev/null || true
rm -rf "$APP" "$LAUNCH_APP"

if in_workspace_tmux; then
  # workspace-app's tmux session marks every file this shell creates with
  # com.apple.quarantine (responsible process = workspace-app.app). Gatekeeper
  # then SIGKILLs rustc/build-script binaries mid-compile. Building via launchd
  # sidesteps that ancestry — same workaround as building in a fresh terminal.
  #
  # launchd jobs cannot read ~/Documents (TCC), so only cargo build runs there
  # (output under /tmp). Bundle assembly stays in this shell where icons,
  # entitlements, and codesign inputs are reachable; quarantine is stripped
  # from the finished .app before launch.
  echo "workspace-app tmux detected — building via launchd to avoid Gatekeeper quarantine."
  run_via_launchd "export CARGO_TARGET_DIR='$CARGO_TARGET_DIR'; cd '$ROOT' && cargo build -p workspace-app"
  xattr -dr com.apple.quarantine "$CARGO_TARGET_DIR" 2>/dev/null || true
  WORKSPACE_ROOT="$ROOT" APP="$LAUNCH_APP" CARGO_TARGET_DIR="$CARGO_TARGET_DIR" sh "$ROOT/scripts/build-bundle.sh"
  xattr -dr com.apple.quarantine "$LAUNCH_APP" "$CARGO_TARGET_DIR" 2>/dev/null || true
  mkdir -p "$(dirname "$APP")"
  cp -R "$LAUNCH_APP" "$APP"
  xattr -dr com.apple.quarantine "$APP" 2>/dev/null || true
else
  sh scripts/build-app.sh
fi

LOG="/tmp/workspace-app-run.$$.log"
: > "$LOG"
if ! open -n "$APP" --stdout "$LOG" --stderr "$LOG" 2>/dev/null; then
  stop_workspace_app
  sleep 0.5
  if ! open -n "$APP" --stdout "$LOG" --stderr "$LOG"; then
    echo "Failed to launch $APP" >&2
    exit 1
  fi
fi
echo "Log: $LOG (tail -f $LOG to follow)"
