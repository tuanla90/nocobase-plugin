#!/usr/bin/env bash
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
NM="$ROOT/node_modules"
PKG="@tuanla90/plugin-gsheet-sync"
echo "node: $(node -v)"

# Stage source + markers (markers at the STAGED package root are the lane build triggers!)
SRC="$ROOT/../packages/@tuanla90/plugin-gsheet-sync"
DST="$ROOT/packages/plugins/@tuanla90/plugin-gsheet-sync"
rm -rf "$DST"; mkdir -p "$DST"
cp -r "$SRC/src" "$DST/src"
cp "$SRC/package.json" "$DST/package.json"
cp "$SRC/client.js" "$SRC/client-v2.js" "$SRC/server.js" "$DST/"
cp "$SRC/client.d.ts" "$SRC/client-v2.d.ts" "$SRC/server.d.ts" "$DST/"

# Server is zero-dep (node crypto + fetch); client is antd-only. The only bundled
# dependency is @tuanla90/shared (ColumnSelect for the target-field picker).

# @tuanla90/shared is a workspace package npm prunes on every install — restore it from
# packages/ so the build can resolve/bundle it.
SHARED_SRC="$ROOT/../packages/@tuanla90/shared"
if [ ! -f "$NM/@tuanla90/shared/package.json" ] || [ "$SHARED_SRC/dist/index.js" -nt "$NM/@tuanla90/shared/dist/index.js" ]; then
  mkdir -p "$NM/@tuanla90"
  rm -rf "$NM/@tuanla90/shared"
  cp -r "$SHARED_SRC" "$NM/@tuanla90/shared"
  echo "restored  : @tuanla90/shared"
fi

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

node "$NM/@nocobase/build/bin/nocobase-build.js" "$PKG" --tar --no-dts

echo "=== TAR OUTPUT ==="
TGZ=$(find "$ROOT/storage/tar" -type f -name "*plugin-gsheet-sync*" 2>/dev/null | sort -V | tail -1)
echo "$TGZ"
if [ -n "$TGZ" ]; then
  bash "$ROOT/recipes/add-markers.sh" "$TGZ"
  echo "--- tgz contents ---"
  tar -tzf "$TGZ" | grep -E "^(client|server|dist/(client|client-v2|server)/index.js)" | head -10
fi
