#!/usr/bin/env bash
# Build @tuanla90/plugin-inline-field into a tgz (server + client-v2 lanes), markers injected.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
NM="$ROOT/node_modules"
PKG="@tuanla90/plugin-inline-field"
NAME="plugin-inline-field"

# Fresh build-env copy from the workspace (source of truth).
SRC="$ROOT/../packages/@tuanla90/$NAME"
DST="$ROOT/packages/plugins/@tuanla90/$NAME"
rm -rf "$DST"; mkdir -p "$DST"
cp -r "$SRC/src" "$DST/src"
cp "$SRC/package.json" "$DST/package.json"
cp "$SRC/client.js" "$SRC/client-v2.js" "$SRC/server.js" "$DST/"
cp "$SRC/client.d.ts" "$SRC/client-v2.d.ts" "$SRC/server.d.ts" "$DST/"
echo "synced <- $SRC"

# Stub EXTERNAL framework deps (harvested from the running nb-local host 2.1.19) so externalVersion.js
# matches the runtime. @tuanla90/shared is REAL in build-env node_modules -> bundled into the plugin.
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
mkstub "@nocobase/flow-engine" 2.1.19
mkstub "@nocobase/server" 2.1.19
mkstub "@formily/antd-v5" 1.2.3
mkstub "@formily/react" 2.3.7
mkstub dayjs 1.11.21

echo "node: $(node -v)"
node "$NM/@nocobase/build/bin/nocobase-build.js" "$PKG" --tar --no-dts

# /v/ only loads the client-v2 lane when a root `client-v2.js` marker sits in the tgz; --tar doesn't pack
# markers. Target the EXACT version built (never `find|head -1` — grabs the oldest tgz once history exists).
VER=$(grep '"version"' "$DST/package.json" | head -1 | sed 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
TGZ="$ROOT/storage/tar/$PKG-$VER.tgz"
if [ -f "$TGZ" ]; then
  bash "$ROOT/recipes/add-markers.sh" "$TGZ" || true
else
  echo "WARN: expected tgz not found, markers NOT injected: $TGZ"
fi

echo "=== TAR OUTPUT ==="
find "$ROOT/storage/tar" -type f -name "*inline-field*" 2>/dev/null || true
