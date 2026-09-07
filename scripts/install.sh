#!/usr/bin/env bash
# Updates /Applications/Director OS.app in place.
#
# The bundle directory itself is never deleted — rsync adds, updates and removes
# files inside it. That keeps the same bundle identity, so Dock pins, aliases and
# LaunchServices registration survive an update. (`--delete` is what stops stale
# hashed asset files from a previous build piling up, which is the only reason a
# plain `cp` over the top isn't safe.)
set -euo pipefail

APP_NAME="Director OS"
SRC="$(cd "$(dirname "$0")/.." && pwd)/src-tauri/target/release/bundle/macos/${APP_NAME}.app"
DEST="/Applications/${APP_NAME}.app"

[ -d "$SRC" ] || { echo "No built app at: $SRC — run 'npm run app:build' first." >&2; exit 1; }

was_running=false
if pgrep -f "${DEST}/Contents/MacOS/" >/dev/null 2>&1; then
  was_running=true
  echo "Quitting ${APP_NAME}…"
  # Ask nicely so the app can flush its final autosave, rather than SIGTERM.
  osascript -e "tell application \"${APP_NAME}\" to quit" >/dev/null 2>&1 || true
  for _ in $(seq 1 20); do
    pgrep -f "${DEST}/Contents/MacOS/" >/dev/null 2>&1 || break
    sleep 0.25
  done
  pgrep -f "${DEST}/Contents/MacOS/" >/dev/null 2>&1 && pkill -f "${DEST}/Contents/MacOS/" || true
fi

mkdir -p "$DEST"
rsync -a --delete "$SRC/" "$DEST/"
echo "Updated in place: $DEST"

if [ "${1:-}" = "--relaunch" ] || [ "$was_running" = true ]; then
  open -a "$APP_NAME"
  echo "Relaunched ${APP_NAME}."
fi
