#!/usr/bin/env bash
# Build @ptdl/plugin-branding (admin skin builder).
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
NM="$ROOT/node_modules"
PKG="@ptdl/plugin-branding"
NAME="plugin-branding"

SRC="$ROOT/../packages/@ptdl/$NAME"
DST="$ROOT/packages/plugins/@ptdl/$NAME"
rm -rf "$DST"; mkdir -p "$DST"
cp -r "$SRC/src" "$DST/src"
cp "$SRC/package.json" "$DST/package.json"
cp "$SRC/client.js" "$SRC/client-v2.js" "$SRC/server.js" "$DST/"
cp "$SRC/client.d.ts" "$SRC/client-v2.d.ts" "$SRC/server.d.ts" "$DST/"

# @ptdl/shared is a workspace pkg npm prunes — restore from packages so the build bundles it.
SHARED_SRC="$ROOT/../packages/@ptdl/shared"
if [ ! -f "$NM/@ptdl/shared/package.json" ] || [ "$SHARED_SRC/dist/index.js" -nt "$NM/@ptdl/shared/dist/index.js" ]; then
  mkdir -p "$NM/@ptdl"; rm -rf "$NM/@ptdl/shared"; cp -r "$SHARED_SRC" "$NM/@ptdl/shared"; echo "restored  : @ptdl/shared"
fi

mkstub() {
  local name="$1"; local ver="$2"
  if [ -f "$NM/$name/package.json" ]; then echo "keep real : $name"; return; fi
  mkdir -p "$NM/$name"; printf '{"name":"%s","version":"%s"}\n' "$name" "$ver" > "$NM/$name/package.json"; echo "stub      : $name@$ver"
}
mkstub react 18.3.1
mkstub react-dom 18.3.1
mkstub antd 5.24.2
mkstub "@ant-design/icons" 5.6.1
mkstub "@nocobase/client" 2.1.19
mkstub "@nocobase/client-v2" 2.1.19
mkstub "@nocobase/server" 2.1.19
mkstub "@nocobase/actions" 2.1.19

node "$NM/@nocobase/build/bin/nocobase-build.js" "$PKG" --tar --no-dts

echo "=== TAR OUTPUT ==="
find "$ROOT/storage/tar" -type f -name "*plugin-branding*" 2>/dev/null | sort | tail -1
