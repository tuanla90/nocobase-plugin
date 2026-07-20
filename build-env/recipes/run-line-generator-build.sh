#!/usr/bin/env bash
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
NM="$ROOT/node_modules"
PKG="@tuanla90/plugin-line-generator"

# Sync src + version from the workspace (source of truth).
SRC="$ROOT/../packages/@tuanla90/plugin-line-generator"
DST="$ROOT/packages/plugins/@tuanla90/plugin-line-generator"
mkdir -p "$DST"
if [ -d "$SRC/src" ]; then
  rm -rf "$DST/src"
  cp -r "$SRC/src" "$DST/src"
  cp "$SRC/package.json" "$DST/package.json"
  [ -f "$SRC/README.md" ] && cp "$SRC/README.md" "$DST/README.md" || true
  # Root lane markers — the builder detects which lanes to build by these files' presence.
  for f in client.js client-v2.js server.js client.d.ts client-v2.d.ts server.d.ts; do
    [ -f "$SRC/$f" ] && cp "$SRC/$f" "$DST/$f" || true
  done
  echo "synced src + markers <- $SRC"
fi
VER=$(grep '"version"' "$SRC/package.json" | head -1 | sed -E 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')
echo "node: $(node -v)  version: $VER"

# Vendored @formulajs/formulajs is a self-contained browser bundle imported RELATIVELY → it gets
# bundled, needs NO stub and NO real install. Only framework libs are external (versions = nb-local host).
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
mkstub "@emotion/css" 11.13.5
mkstub "@formily/react" 2.3.7
mkstub "@formily/shared" 2.3.7
mkstub "@nocobase/client" 2.1.19
mkstub "@nocobase/client-v2" 2.1.19
mkstub "@nocobase/flow-engine" 2.1.19
mkstub "@nocobase/server" 2.1.19

node "$NM/@nocobase/build/bin/nocobase-build.js" "$PKG" --tar --no-dts

echo "=== TAR OUTPUT ==="
TGZ=$(find "$ROOT/storage/tar" -type f -name "*plugin-line-generator-${VER:-*}.tgz" 2>/dev/null | sort -V | tail -1)
echo "$TGZ"
if [ -n "$TGZ" ]; then
  bash "$ROOT/recipes/add-markers.sh" "$TGZ"
fi
