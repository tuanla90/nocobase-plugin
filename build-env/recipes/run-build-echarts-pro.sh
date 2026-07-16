#!/usr/bin/env bash
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
NM="$ROOT/node_modules"
SEMANTIX="/d/Users/tuanla2/semantix/node_modules"
PKG="@ptdl/plugin-data-visualization-echarts-pro"
NAME="plugin-data-visualization-echarts-pro"

# --- stage fresh source (new-style) ---
SRC="$ROOT/../packages/@ptdl/$NAME"
DST="$ROOT/packages/plugins/@ptdl/$NAME"
rm -rf "$DST"; mkdir -p "$DST"
cp -r "$SRC/src" "$DST/src"
cp "$SRC/package.json" "$DST/package.json"
for f in client.js client-v2.js server.js client.d.ts client-v2.d.ts server.d.ts; do
  [ -f "$SRC/$f" ] && cp "$SRC/$f" "$DST/" || true
done

mkstub() {
  local name="$1"; local ver="$2"
  if [ -f "$NM/$name/package.json" ]; then echo "keep real : $name"; return; fi
  mkdir -p "$NM/$name"
  printf '{"name":"%s","version":"%s","main":"index.js"}\n' "$name" "$ver" > "$NM/$name/package.json"
  printf 'module.exports = {};\n' > "$NM/$name/index.js"
  echo "stub      : $name@$ver"
}
mkstub_dv() {
  local name="@nocobase/plugin-data-visualization"
  if [ -f "$NM/$name/package.json" ]; then echo "keep real : $name"; return; fi
  mkdir -p "$NM/$name/dist/client" "$NM/$name/dist/client-v2" "$NM/$name/dist/server"
  printf '{"name":"%s","version":"2.1.19","main":"dist/server/index.js"}\n' "$name" > "$NM/$name/package.json"
  for lane in client client-v2 server; do
    printf 'module.exports = {};\n' > "$NM/$name/dist/$lane/index.js"
    printf "module.exports = require('./dist/%s/index.js');\n" "$lane" > "$NM/$name/$lane.js"
  done
  echo "stub      : $name (client/client-v2/server)"
}
copyreal() {
  local name="$1"
  if [ -d "$NM/$name" ]; then echo "have real : $name"; return; fi
  if [ ! -d "$SEMANTIX/$name" ]; then echo "MISSING SOURCE for $name at $SEMANTIX/$name"; exit 1; fi
  mkdir -p "$(dirname "$NM/$name")"
  cp -r "$SEMANTIX/$name" "$NM/$name"
  echo "copied    : $name"
}

echo "=== real deps to bundle (echarts) ==="
copyreal echarts
copyreal zrender
copyreal tslib

echo "=== externals (stubbed) ==="
mkstub react 18.3.1
mkstub react-dom 18.3.1
mkstub lodash 4.17.21
mkstub antd 5.24.2
mkstub "@ant-design/icons" 5.6.1
mkstub "@emotion/css" 11.13.5
mkstub "react-i18next" 11.18.6
mkstub "@formily/react" 2.2.27
mkstub "@formily/shared" 2.2.27
mkstub "@nocobase/client" 2.1.19
mkstub "@nocobase/client-v2" 2.1.19
mkstub "@nocobase/server" 2.1.19
mkstub "@nocobase/flow-engine" 2.1.19
mkstub_dv

node "$NM/@nocobase/build/bin/nocobase-build.js" "$PKG" --tar --no-dts

echo "=== TAR OUTPUT ==="
find "$ROOT/storage/tar" -type f -name "*echarts-pro*" 2>/dev/null || true
