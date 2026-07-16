#!/usr/bin/env bash
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
NM="$ROOT/node_modules"
PKG="@ptdl/plugin-custom-icons"

# Stub version for EXTERNAL framework deps (only if not really installed).
# Used only to write dist/externalVersion.js. lucide-react is NOT stubbed — it is
# a real dependency and must be bundled.
mkstub() {
  local name="$1"; local ver="$2"
  if [ -f "$NM/$name/package.json" ]; then echo "keep real : $name"; return; fi
  mkdir -p "$NM/$name"
  printf '{"name":"%s","version":"%s"}\n' "$name" "$ver" > "$NM/$name/package.json"
  echo "stub      : $name@$ver"
}
mkstub react 18.3.1
mkstub "@ant-design/icons" 5.6.1
mkstub "@nocobase/client" 2.1.9
mkstub "@nocobase/client-v2" 2.1.9
mkstub "@nocobase/server" 2.1.9

# Build client (rspack->UMD) + client-v2 + server (tsup->cjs) + package .tgz.
node "$NM/@nocobase/build/bin/nocobase-build.js" "$PKG" --tar --no-dts

echo "=== TAR OUTPUT ==="
find "$ROOT/storage/tar" -type f

# inject /v/ + /admin client-lane markers (client.js/client-v2.js) — NocoBase skips client bundles without them.
__TGZ=$(find "$ROOT/storage/tar" -type f -name "$(basename "$PKG")-*.tgz" 2>/dev/null | sort -V | tail -1)
if [ -n "$__TGZ" ]; then bash "$ROOT/recipes/add-markers.sh" "$__TGZ"; fi
