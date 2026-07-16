#!/usr/bin/env bash
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
NM="$ROOT/node_modules"
PKG="@ptdl/plugin-formula"

# Sync src từ workspace packages/@ptdl (nguồn chân lý) — trước đây build bản stale trong build-env.
SRC="$ROOT/../packages/@ptdl/plugin-formula"
DST="$ROOT/packages/plugins/@ptdl/plugin-formula"
if [ -d "$SRC/src" ]; then
  rm -rf "$DST/src"
  cp -r "$SRC/src" "$DST/src"
  echo "synced src <- $SRC"
fi
# Sync version from the workspace package.json into the build-env copy (recipe only syncs `src`,
# so version bumps were silently shipped under the OLD number). Update just the version field.
VER=$(grep '"version"' "$SRC/package.json" | head -1 | sed -E 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')
if [ -n "$VER" ]; then
  sed -i -E "s/(\"version\"[[:space:]]*:[[:space:]]*\")[^\"]+(\")/\1$VER\2/" "$DST/package.json"
  echo "synced version -> $VER"
fi

echo "node: $(node -v)"

# Stub EXTERNAL framework deps (versions from the running nb-local host, NocoBase 2.1.19)
# so dist/externalVersion.js matches the runtime. @formulajs/formulajs (+ its deps
# jstat/bessel/numeric) are KEPT REAL so they get bundled into the client lane.
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
TGZ=$(find "$ROOT/storage/tar" -type f -name "*plugin-formula-${VER:-*}.tgz" 2>/dev/null | sort -V | tail -1)
echo "$TGZ"
if [ -n "$TGZ" ]; then
  bash "$ROOT/recipes/add-markers.sh" "$TGZ"
fi
