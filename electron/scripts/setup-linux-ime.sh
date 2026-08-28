#!/bin/sh
# Linux/WSL: install Hangul IME (aligned with Orca terminal-ime e2e deps).
# macOS/Windows native builds do not need this.
#
#   sh scripts/setup-linux-ime.sh
set -eu

if [ "$(uname -s)" != "Linux" ]; then
  echo "Not Linux — skip."
  exit 0
fi

sudo apt-get update
sudo apt-get install -y \
  ibus ibus-hangul ibus-gtk3 \
  dconf-gsettings-backend libglib2.0-bin \
  x11-xkb-utils \
  fonts-noto-cjk

RC="${HOME}/.bashrc"
append_once() {
  line="$1"
  if ! grep -qxF "$line" "$RC" 2>/dev/null; then
    echo "$line" >> "$RC"
  fi
}
append_once 'export GTK_IM_MODULE=ibus'
append_once 'export QT_IM_MODULE=ibus'
append_once 'export XMODIFIERS=@im=ibus'

export GTK_IM_MODULE=ibus
export QT_IM_MODULE=ibus
export XMODIFIERS=@im=ibus

# Orca hangul engine defaults (run-terminal-ibus-hangul-e2e.mjs)
gsettings set org.freedesktop.ibus.engine.hangul initial-input-mode hangul 2>/dev/null || true
gsettings set org.freedesktop.ibus.engine.hangul hangul-keyboard 2 2>/dev/null || true
gsettings set org.freedesktop.ibus.general preload-engines "['hangul', 'xkb:us::eng']" 2>/dev/null || true

ibus-daemon --xim -drx --panel=disable --emoji-extension=disable || true
ibus engine hangul 2>/dev/null || true

echo ""
echo "Done. Restart the app:"
echo "  cd ~/workspace/electron && npm run dev"
echo ""
echo "IBus owns Hangul (same as Orca). Bind a toggle in ibus-setup if needed."
echo "Under WSLg, the Windows 한영 key may stay with the host — use the IBus"
echo "engine switcher shortcut from ibus-setup, or: ibus engine hangul"
