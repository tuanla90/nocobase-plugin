#!/usr/bin/env bash
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
NM="$ROOT/node_modules"
PKG="@tuanla90/plugin-login-lite"
NAME="plugin-login-lite"

SRC="$ROOT/../packages/@tuanla90/$NAME"
DST="$ROOT/packages/plugins/@tuanla90/$NAME"
rm -rf "$DST"; mkdir -p "$DST"
cp -r "$SRC/src" "$DST/src"
cp "$SRC/package.json" "$DST/package.json"
cp "$SRC/client.js" "$SRC/client-v2.js" "$SRC/server.js" "$DST/"
cp "$SRC/client.d.ts" "$SRC/client-v2.d.ts" "$SRC/server.d.ts" "$DST/"

# markdown-it is NOT stubbed -> real dependency, must be bundled.
mkstub() {
  local name="$1"; local ver="$2"
  if [ -f "$NM/$name/package.json" ]; then echo "keep real : $name"; return; fi
  mkdir -p "$NM/$name"
  printf '{"name":"%s","version":"%s"}\n' "$name" "$ver" > "$NM/$name/package.json"
  echo "stub      : $name@$ver"
}
mkstub react 18.3.1
mkstub react-dom 18.3.1
mkstub react-i18next 11.18.6
mkstub react-router-dom 6.30.4
mkstub react-router 6.30.4
mkstub antd 5.24.2
mkstub "@ant-design/icons" 5.6.1
mkstub "@emotion/css" 11.13.5
mkstub "@formily/core" 2.3.7
mkstub "@formily/react" 2.3.7
mkstub "@formily/reactive" 2.3.7
mkstub "@formily/shared" 2.3.7
mkstub ahooks 3.9.7
mkstub lodash 4.18.1
mkstub "@nocobase/client" 2.1.19
mkstub "@nocobase/client-v2" 2.1.19
mkstub "@nocobase/server" 2.1.19
mkstub "@nocobase/actions" 2.1.19
mkstub "@nocobase/plugin-auth" 2.1.19

node "$NM/@nocobase/build/bin/nocobase-build.js" "$PKG" --tar --no-dts

echo "=== TAR OUTPUT ==="
find "$ROOT/storage/tar" -type f -name "*login-lite*" 2>/dev/null || true

# inject /v/ + /admin client-lane markers (client.js/client-v2.js) — NocoBase skips client bundles without them.
__TGZ=$(find "$ROOT/storage/tar" -type f -name "$(basename "$PKG")-*.tgz" 2>/dev/null | sort -V | tail -1)
if [ -n "$__TGZ" ]; then bash "$ROOT/recipes/add-markers.sh" "$__TGZ"; fi
