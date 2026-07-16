#!/usr/bin/env bash
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
NM="$ROOT/node_modules"
PKG="@ptdl/plugin-quick-view"
PKGDIR="$ROOT/packages/plugins/$PKG"

# Sync src + version from the workspace (source of truth). Only the version field of package.json is
# synced (build-env copy may differ in devDeps).
SRC="$ROOT/../packages/@ptdl/plugin-quick-view"
if [ -d "$SRC/src" ]; then
  rm -rf "$PKGDIR/src"; cp -r "$SRC/src" "$PKGDIR/src"; echo "synced src <- $SRC"
fi
VERSRC=$(grep '"version"' "$SRC/package.json" | head -1 | sed 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
if [ -n "$VERSRC" ]; then
  sed -i -E "s/(\"version\"[[:space:]]*:[[:space:]]*\")[^\"]+(\")/\1$VERSRC\2/" "$PKGDIR/package.json"
  echo "synced version -> $VERSRC"
fi

# Keep the bundled @ptdl/shared current (ColumnSelect / setSharedT live there).
if [ -d "$ROOT/../packages/@ptdl/shared/dist" ]; then
  cp -r "$ROOT/../packages/@ptdl/shared/dist/." "$NM/@ptdl/shared/dist/"; echo "synced @ptdl/shared dist"
fi

echo "node: $(node -v)"

# Stub EXTERNAL framework deps (host = nb-local 2.1.19). This plugin bundles only @ptdl/shared;
# antd / icons / react / @nocobase/* (incl. flow-engine, whose `uid` we import) are all external.
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
mkstub "@formily/react" 2.2.27
mkstub "@formily/core" 2.2.27
mkstub "@nocobase/client" 2.1.19
mkstub "@nocobase/client-v2" 2.1.19
mkstub "@nocobase/server" 2.1.19
mkstub "@nocobase/flow-engine" 2.1.19
# @ptdl/shared's settingsKit pulls @formily/react + lucide-react at module top-level; formily is an
# external (app-provided) so a version stub is enough, lucide-react must be a REAL bundled dep.
if [ ! -f "$NM/lucide-react/package.json" ]; then npm i lucide-react@0.469.0 --no-audit --no-fund --no-save >/dev/null 2>&1 || true; fi

node "$NM/@nocobase/build/bin/nocobase-build.js" "$PKG" --tar --no-dts

# server-only lane fixup (build may collapse to dist/index.js; main points at dist/server/index.js)
if [ ! -f "$PKGDIR/dist/server/index.js" ] && [ -f "$PKGDIR/dist/index.js" ]; then
  mkdir -p "$PKGDIR/dist/server"
  cp "$PKGDIR/dist/index.js" "$PKGDIR/dist/server/index.js"
  echo "fixup     : copied dist/index.js -> dist/server/index.js"
  node "$NM/@nocobase/build/bin/nocobase-build.js" "$PKG" --only-tar
fi

# Inject client.js / client-v2.js markers into the EXACT version tgz (never find|head -1).
VER=$(grep '"version"' "$PKGDIR/package.json" | head -1 | sed 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
TGZ="$ROOT/storage/tar/$PKG-$VER.tgz"
if [ -f "$TGZ" ]; then
  bash "$ROOT/recipes/add-markers.sh" "$TGZ" || true
else
  echo "WARN: expected tgz not found, markers NOT injected: $TGZ"
fi

echo "=== TAR OUTPUT ==="
find "$ROOT/storage/tar" -type f -name "*quick-view*" 2>/dev/null || true
