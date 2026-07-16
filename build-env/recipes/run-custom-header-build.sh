#!/usr/bin/env bash
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
NM="$ROOT/node_modules"
PKG="@ptdl/plugin-custom-header"

echo "node: $(node -v)"

# Sync source from the canonical workspace into build-env's build tree.
SRC="$ROOT/../packages/@ptdl/plugin-custom-header"
DST="$ROOT/packages/plugins/@ptdl/plugin-custom-header"
rm -rf "$DST"
mkdir -p "$DST"
cp -r "$SRC/src" "$DST/src"
cp "$SRC/package.json" "$DST/package.json"
# Root marker files double as BUILD TRIGGERS: @nocobase/build only builds the client /
# client-v2 lanes when client.js / client-v2.js exist at the SOURCE root (rootEntryFile).
cp "$SRC/client.js" "$SRC/client-v2.js" "$SRC/server.js" "$DST/"
cp "$SRC/client.d.ts" "$SRC/client-v2.d.ts" "$SRC/server.d.ts" "$DST/"

# Stub EXTERNAL framework deps (NocoBase 2.1.19) so dist/externalVersion.js matches runtime.
# No bundled deps — icons come from the shared registry, styling is antd + inline.
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
mkstub "@nocobase/client" 2.1.19
mkstub "@nocobase/client-v2" 2.1.19
mkstub "@nocobase/flow-engine" 2.1.19
mkstub "@nocobase/server" 2.1.19
mkstub "@formily/react" 2.3.7

node "$NM/@nocobase/build/bin/nocobase-build.js" "$PKG" --tar --no-dts

echo "=== TAR OUTPUT ==="
find "$ROOT/storage/tar" -type f -name "*custom-header*" 2>/dev/null || true
