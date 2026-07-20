#!/usr/bin/env bash
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
# Guard: the two self-contained page-builders (app-builder + instant-create-page quickView.tsx) must not
# silently diverge on shared logic. Fails the build if they do — see checks/quickview-sync.mjs.
node "$ROOT/checks/quickview-sync.mjs"
NM="$ROOT/node_modules"
PKG="@tuanla90/plugin-app-builder"
PKGDIR="$ROOT/packages/plugins/$PKG"

# Sync src + the FULL package.json + root lane markers from the workspace (source of truth). Like
# instant-create-page, this plugin imports NOTHING from @tuanla90/shared (appSpec.ts is self-contained; the
# page tier reuses flowEngine at runtime), so there is no shared/@formily bundling machinery to set up.
SRC="$ROOT/../packages/@tuanla90/plugin-app-builder"
rm -rf "$PKGDIR"; mkdir -p "$PKGDIR"
cp -r "$SRC/src" "$PKGDIR/src"; echo "synced src <- $SRC"
cp "$SRC/package.json" "$PKGDIR/package.json"; echo "synced package.json <- $SRC"
cp "$SRC/client.js" "$SRC/client-v2.js" "$SRC/server.js" "$PKGDIR/" 2>/dev/null || true
cp "$SRC/client.d.ts" "$SRC/client-v2.d.ts" "$SRC/server.d.ts" "$PKGDIR/" 2>/dev/null || true

echo "node: $(node -v)"

# Stub EXTERNAL framework deps (host = nb-local 2.1.19). All of antd / icons / react / @nocobase/* are
# external (app-provided); a name+version stub is enough (only externalVersion.js reads them).
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
mkstub "@nocobase/flow-engine" 2.1.19

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
find "$ROOT/storage/tar" -type f -name "*app-builder*" 2>/dev/null || true
