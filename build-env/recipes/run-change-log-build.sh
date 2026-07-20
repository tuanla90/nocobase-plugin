#!/usr/bin/env bash
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
NM="$ROOT/node_modules"
PKG="@tuanla90/plugin-change-log"
echo "node: $(node -v)"

# Stage source + markers (markers at the STAGED package root are the lane build triggers!)
SRC="$ROOT/../packages/@tuanla90/plugin-change-log"
DST="$ROOT/packages/plugins/@tuanla90/plugin-change-log"
rm -rf "$DST"; mkdir -p "$DST"
cp -r "$SRC/src" "$DST/src"
cp "$SRC/package.json" "$DST/package.json"
cp "$SRC/client.js" "$SRC/client-v2.js" "$SRC/server.js" "$DST/"
cp "$SRC/client.d.ts" "$SRC/client-v2.d.ts" "$SRC/server.d.ts" "$DST/"

# Stub EXTERNAL framework deps at nb-local (2.1.19) versions so
# writeExternalPackageVersion resolves and the tgz step is not aborted.
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
mkstub "@nocobase/flow-engine" 2.1.19
mkstub "@nocobase/server" 2.1.19
mkstub "@nocobase/database" 2.1.19
mkstub "@formily/react" 2.3.7

node "$NM/@nocobase/build/bin/nocobase-build.js" "$PKG" --tar --no-dts

echo "=== TAR OUTPUT ==="
TGZ=$(find "$ROOT/storage/tar" -type f -name "*plugin-change-log*" 2>/dev/null | sort -V | tail -1)
echo "$TGZ"
if [ -n "$TGZ" ]; then
  # Markers were staged so they should already be in the tgz; add-markers.sh is idempotent insurance.
  bash "$ROOT/recipes/add-markers.sh" "$TGZ"
  echo "--- tgz contents ---"
  tar -tzf "$TGZ" | head -30
fi
