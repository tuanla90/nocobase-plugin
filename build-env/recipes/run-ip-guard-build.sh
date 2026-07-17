#!/usr/bin/env bash
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
NM="$ROOT/node_modules"
PKG="@ptdl/plugin-ip-guard"
echo "node: $(node -v)"

# Stage source + lane markers from the workspace (source of truth). Markers at the STAGED package
# root are what trigger the client / client-v2 lane builds.
SRC="$ROOT/../packages/@ptdl/plugin-ip-guard"
DST="$ROOT/packages/plugins/@ptdl/plugin-ip-guard"
rm -rf "$DST"; mkdir -p "$DST"
cp -r "$SRC/src" "$DST/src"
cp "$SRC/package.json" "$DST/package.json"
cp "$SRC/README.md" "$DST/README.md" 2>/dev/null || true
cp "$SRC/client.js" "$SRC/client-v2.js" "$SRC/server.js" "$DST/"
cp "$SRC/client.d.ts" "$SRC/client-v2.d.ts" "$SRC/server.d.ts" "$DST/"

# Stub EXTERNAL framework deps at nb-local (2.1.19) versions so writeExternalPackageVersion resolves
# and the tgz step is not aborted. (@ptdl/shared + lucide-react are BUNDLED, not stubbed — they must
# be resolvable real packages in node_modules, same as the change-log build.)
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

echo "=== TAR OUTPUT ==="
VER=$(grep '"version"' "$DST/package.json" | head -1 | sed 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
TGZ="$ROOT/storage/tar/$PKG-$VER.tgz"
if [ -f "$TGZ" ]; then
  # Markers were staged so they should already be in the tgz; add-markers.sh is idempotent insurance.
  bash "$ROOT/recipes/add-markers.sh" "$TGZ"
  echo "--- tgz contents ---"
  tar -tzf "$TGZ" | head -40
else
  echo "WARN: expected tgz not found: $TGZ"
  find "$ROOT/storage/tar" -type f -name "*plugin-ip-guard*" 2>/dev/null || true
fi
