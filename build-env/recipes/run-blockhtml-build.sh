#!/usr/bin/env bash
# NOTE (2026-07-10): replaces the stale run-build-block-html.sh, which still invoked
# nocobase-build on the pre-scope-migration name `@nocobase/plugin-block-custom-html`
# (source has been `@ptdl/plugin-block-custom-html` since the scope rename) and never
# staged fresh source — it only happened to work while the staged copy was untouched.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
NM="$ROOT/node_modules"
PKG="@ptdl/plugin-block-custom-html"
SRC="$ROOT/../packages/@ptdl/plugin-block-custom-html"
DST="$ROOT/packages/plugins/@ptdl/plugin-block-custom-html"

echo "node: $(node -v)"
rm -rf "$DST"; mkdir -p "$DST"
cp -r "$SRC/src" "$DST/src"
cp "$SRC/package.json" "$DST/package.json"
cp "$SRC/client.js" "$SRC/client-v2.js" "$SRC/server.js" "$DST/"
cp "$SRC"/*.d.ts "$DST/" 2>/dev/null || true

mkstub() {
  local name="$1"; local ver="$2"
  if [ -f "$NM/$name/package.json" ]; then echo "keep real : $name"; return; fi
  mkdir -p "$NM/$name"; printf '{"name":"%s","version":"%s"}\n' "$name" "$ver" > "$NM/$name/package.json"; echo "stub      : $name@$ver"
}
mkstub react 18.3.1
mkstub react-dom 18.3.1
mkstub antd 5.24.2
mkstub "@nocobase/client" 2.1.19
mkstub "@nocobase/client-v2" 2.1.19
mkstub "@nocobase/flow-engine" 2.1.19
mkstub "@nocobase/server" 2.1.19

node "$NM/@nocobase/build/bin/nocobase-build.js" "$PKG" --tar --no-dts

# Server-only lane sometimes collapses to dist/index.js instead of dist/server/index.js
# (package.json "main" points at the latter) — relocate + re-tar, same fixup as global-search.
if [ ! -f "$DST/dist/server/index.js" ] && [ -f "$DST/dist/index.js" ]; then
  mkdir -p "$DST/dist/server"
  cp "$DST/dist/index.js" "$DST/dist/server/index.js"
  [ -f "$DST/dist/plugin.js" ] && cp "$DST/dist/plugin.js" "$DST/dist/server/plugin.js"
  echo "fixup: copied dist/index.js -> dist/server/index.js"
  node "$NM/@nocobase/build/bin/nocobase-build.js" "$PKG" --only-tar
fi

echo "=== TAR OUTPUT ==="
find "$ROOT/storage/tar" -type f -name "*block-custom-html*" 2>/dev/null || true
