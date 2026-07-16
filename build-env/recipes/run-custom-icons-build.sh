#!/usr/bin/env bash
# Build @ptdl/plugin-custom-icons (Lucide provider + icon-remap, merged) into a tgz.
# lucide-react is NOT stubbed — real dependency, must be bundled.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
NM="$ROOT/node_modules"
PKG="@ptdl/plugin-custom-icons"
NAME="plugin-custom-icons"

SRC="$ROOT/../packages/@ptdl/$NAME"
DST="$ROOT/packages/plugins/@ptdl/$NAME"
rm -rf "$DST"; mkdir -p "$DST"
cp -r "$SRC/src" "$DST/src"
cp "$SRC/package.json" "$DST/package.json"
cp "$SRC/client.js" "$SRC/client-v2.js" "$SRC/server.js" "$DST/"
echo "staged   : $DST"

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

TGZ=$(find "$ROOT/storage/tar" -type f -name "*custom-icons*.tgz" 2>/dev/null | sort | tail -1)
[ -n "$TGZ" ] && bash "$(dirname "$0")/add-markers.sh" "$TGZ" || true
echo "=== TAR OUTPUT ===" && echo "$TGZ"
