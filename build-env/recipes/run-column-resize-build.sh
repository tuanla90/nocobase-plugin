#!/usr/bin/env bash
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
NM="$ROOT/node_modules"
PKG="@tuanla90/plugin-column-resize"
PKGDIR="$ROOT/packages/plugins/$PKG"

# Sync src + version from the workspace (source of truth). This recipe builds the build-env COPY.
SRC="$ROOT/../packages/@tuanla90/plugin-column-resize"
mkdir -p "$PKGDIR"
if [ -d "$SRC/src" ]; then
  rm -rf "$PKGDIR/src"; cp -r "$SRC/src" "$PKGDIR/src"; cp "$SRC/package.json" "$PKGDIR/package.json"; cp "$SRC"/*.js "$SRC"/*.d.ts "$PKGDIR/" 2>/dev/null || true; echo "synced src <- $SRC"
fi
VERSRC=$(grep '"version"' "$SRC/package.json" | head -1 | sed 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
if [ -n "$VERSRC" ]; then
  sed -i -E "s/(\"version\"[[:space:]]*:[[:space:]]*\")[^\"]+(\")/\1$VERSRC\2/" "$PKGDIR/package.json"
  echo "synced version -> $VERSRC"
fi

echo "node: $(node -v)"

# Stub EXTERNAL framework deps (versions from the running nb-local host 2.1.19). This plugin bundles
# NOTHING of its own — react / antd / @nocobase/* are all external.
mkstub() {
  local name="$1"; local ver="$2"
  if [ -f "$NM/$name/package.json" ]; then echo "keep real : $name"; return; fi
  mkdir -p "$NM/$name"
  printf '{"name":"%s","version":"%s"}\n' "$name" "$ver" > "$NM/$name/package.json"
  echo "stub      : $name@$ver"
}
mkstub react 18.3.1
mkstub react-dom 18.3.1
mkstub antd 5.24.2
mkstub "@ant-design/icons" 5.6.1
mkstub "@nocobase/client" 2.1.19
mkstub "@nocobase/client-v2" 2.1.19
mkstub "@nocobase/server" 2.1.19

node "$NM/@nocobase/build/bin/nocobase-build.js" "$PKG" --tar --no-dts

# nocobase-build may collapse a server-only lane to dist/index.js instead of dist/server/index.js that
# package.json "main" points at -> pm enable would fail. Relocate + repackage.
if [ ! -f "$PKGDIR/dist/server/index.js" ] && [ -f "$PKGDIR/dist/index.js" ]; then
  mkdir -p "$PKGDIR/dist/server"
  cp "$PKGDIR/dist/index.js" "$PKGDIR/dist/server/index.js"
  echo "fixup     : copied dist/index.js -> dist/server/index.js"
  node "$NM/@nocobase/build/bin/nocobase-build.js" "$PKG" --only-tar
fi

# /v/ modern client only loads the client-v2 lane when a `client-v2.js` marker sits at the package root;
# `nocobase-build --tar` does NOT pack markers -> inject them into the EXACT version's tgz (never head -1).
VER=$(grep '"version"' "$PKGDIR/package.json" | head -1 | sed 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
TGZ="$ROOT/storage/tar/$PKG-$VER.tgz"
if [ -f "$TGZ" ]; then
  bash "$ROOT/recipes/add-markers.sh" "$TGZ" || bash "$(dirname "$0")/add-markers.sh" "$TGZ" || true
else
  echo "WARN: expected tgz not found, markers NOT injected: $TGZ"
fi

echo "=== TAR OUTPUT ==="
find "$ROOT/storage/tar" -type f -name "*column-resize*" 2>/dev/null || true
