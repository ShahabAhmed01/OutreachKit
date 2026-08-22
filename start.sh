#!/usr/bin/env bash
# OutreachKit launcher for Linux (CachyOS/Arch and other distros)
set -u

cd "$(dirname "$0")" || exit 1

URL="http://localhost:3000"

echo
echo "  =========================================="
echo "    OutreachKit - Instagram DM automation"
echo "  =========================================="
echo

if ! command -v node >/dev/null 2>&1; then
  echo "  [ERROR] Node.js was not found."
  echo "  Install it with your package manager, e.g.:"
  echo "    CachyOS/Arch : sudo pacman -S nodejs npm"
  echo "    Debian/Ubuntu: sudo apt install nodejs npm"
  echo "    Fedora       : sudo dnf install nodejs npm"
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "  Installing dependencies, first run only..."
  if ! npm install; then
    echo
    echo "  [ERROR] npm install failed. Check your internet connection and try again."
    exit 1
  fi
fi

probe() {
  curl -fsS --max-time 2 "$URL/api/status" >/dev/null 2>&1
}

open_browser() {
  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$URL" >/dev/null 2>&1 &
  fi
}

if probe; then
  echo "  OutreachKit is already running - opening browser."
  open_browser
  exit 0
fi

echo "  Starting OutreachKit..."
OUTREACHKIT_NO_OPEN=1 node gui/server.js &
SERVER_PID=$!

TRIES=0
until probe; do
  TRIES=$((TRIES + 1))
  if [ "$TRIES" -ge 30 ]; then
    echo
    echo "  [ERROR] The server did not start. See the output above for details."
    kill "$SERVER_PID" 2>/dev/null
    exit 1
  fi
  sleep 2
done

echo "  Server is up - opening browser."
open_browser

wait "$SERVER_PID"
