#!/bin/sh
# Regenerates the exported Web build in ../godot-demo-web/ — not tracked
# in git (see repo root .gitignore), so this is the one command that
# rebuilds it. Requires the `godot` CLI (Godot 4.x) with Web export
# templates installed (Editor > Manage Export Templates).
set -e
cd "$(dirname "$0")"
mkdir -p ../godot-demo-web
GODOT="${WORKSPACE_GODOT_PATH:-godot}"
"$GODOT" --headless --export-release "Web" "../godot-demo-web/index.html"
