#!/usr/bin/env bash
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
NM="$ROOT/node_modules"
PKG="@ptdl/plugin-hub"
echo "node: $(node -v)"

# Stage source + lane markers from the workspace (source of truth).
SRC="$ROOT/../packages/@ptdl/plugin-hub"
DST="$ROOT/packages/plugins/@ptdl/plugin-hub"
rm -rf "$DST"; mkdir -p "$DST"
cp -r "$SRC/src" "$DST/src"
cp "$SRC/package.json" "$DST/package.json"
cp "$SRC/README.md" "$DST/README.md" 2>/dev/null || true
cp "$SRC/client.js" "$SRC/client-v2.js" "$SRC/server.js" "$DST/"
cp "$SRC/client.d.ts" "$SRC/client-v2.d.ts" "$SRC/server.d.ts" "$DST/"

# Stub EXTERNAL framework deps at nb-local (2.1.19) versions. @ptdl/shared is BUNDLED (must be a real
# resolvable package in node_modules — refreshed by run-shared-build.sh), same as ip-guard/change-log.
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
mkstub "@nocobase/actions" 2.1.19
mkstub "@formily/react" 2.3.7

node "$NM/@nocobase/build/bin/nocobase-build.js" "$PKG" --tar --no-dts

# server-only lane fixup (build may collapse to dist/index.js; main points at dist/server/index.js)
if [ ! -f "$DST/dist/server/index.js" ] && [ -f "$DST/dist/index.js" ]; then
  mkdir -p "$DST/dist/server"
  cp "$DST/dist/index.js" "$DST/dist/server/index.js"
  [ -f "$DST/dist/plugin.js" ] && cp "$DST/dist/plugin.js" "$DST/dist/server/plugin.js"
  echo "fixup     : copied dist/index.js -> dist/server/index.js"
  node "$NM/@nocobase/build/bin/nocobase-build.js" "$PKG" --only-tar
fi

echo "=== TAR OUTPUT ==="
VER=$(grep '"version"' "$DST/package.json" | head -1 | sed 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
TGZ="$ROOT/storage/tar/$PKG-$VER.tgz"
if [ -f "$TGZ" ]; then bash "$ROOT/recipes/add-markers.sh" "$TGZ" || true; else echo "WARN: expected tgz not found: $TGZ"; fi
find "$ROOT/storage/tar" -type f -name "*plugin-hub*" 2>/dev/null || true
