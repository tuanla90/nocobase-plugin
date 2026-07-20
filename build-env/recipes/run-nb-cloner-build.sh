#!/usr/bin/env bash
# Build @tuanla90/plugin-nb-cloner (NocoBase app export/import).
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
NM="$ROOT/node_modules"
PKG="@tuanla90/plugin-nb-cloner"
NAME="plugin-nb-cloner"
echo "node: $(node -v)"

# Stage source + lane markers from the workspace (source of truth).
SRC="$ROOT/../packages/@tuanla90/$NAME"
DST="$ROOT/packages/plugins/@tuanla90/$NAME"
rm -rf "$DST"; mkdir -p "$DST"
cp -r "$SRC/src" "$DST/src"
cp "$SRC/package.json" "$DST/package.json"
cp "$SRC/README.md" "$DST/README.md" 2>/dev/null || true
cp "$SRC/client.js" "$SRC/client-v2.js" "$SRC/server.js" "$DST/"
cp "$SRC/client.d.ts" "$SRC/client-v2.d.ts" "$SRC/server.d.ts" "$DST/"

# @tuanla90/shared is a workspace pkg npm prunes — restore from packages so the build bundles it
# (ConfigContainer + formatNumber; settingsKit pulls lucide-react, which must stay a real package).
SHARED_SRC="$ROOT/../packages/@tuanla90/shared"
if [ ! -f "$NM/@tuanla90/shared/package.json" ] || [ "$SHARED_SRC/dist/index.js" -nt "$NM/@tuanla90/shared/dist/index.js" ]; then
  mkdir -p "$NM/@tuanla90"; rm -rf "$NM/@tuanla90/shared"; cp -r "$SHARED_SRC" "$NM/@tuanla90/shared"; echo "restored  : @tuanla90/shared"
fi

# Stub EXTERNAL framework deps at nb-local (2.1.19) versions so writeExternalPackageVersion resolves
# and the tgz step is not aborted. (@tuanla90/shared + lucide-react are BUNDLED, not stubbed.)
mkstub() {
  local name="$1"; local ver="$2"
  if [ -f "$NM/$name/package.json" ]; then echo "keep real : $name"; return; fi
  mkdir -p "$NM/$name"; printf '{"name":"%s","version":"%s"}\n' "$name" "$ver" > "$NM/$name/package.json"; echo "stub      : $name@$ver"
}
mkstub react 18.3.1
mkstub react-dom 18.3.1
mkstub antd 5.24.2
mkstub "@ant-design/icons" 5.6.1
mkstub "@formily/react" 2.3.7
mkstub "@nocobase/client" 2.1.19
mkstub "@nocobase/client-v2" 2.1.19
mkstub "@nocobase/server" 2.1.19
mkstub "@nocobase/database" 2.1.19
mkstub "@nocobase/actions" 2.1.19

node "$NM/@nocobase/build/bin/nocobase-build.js" "$PKG" --tar --no-dts

echo "=== TAR OUTPUT ==="
VER=$(grep '"version"' "$DST/package.json" | head -1 | sed 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
TGZ="$ROOT/storage/tar/$PKG-$VER.tgz"
if [ -f "$TGZ" ]; then
  # inject the /admin (client.js) + /v/ (client-v2.js) lane markers — without them NocoBase skips
  # the client bundles and the settings page never registers.
  bash "$ROOT/recipes/add-markers.sh" "$TGZ"
  echo "--- tgz contents ---"
  tar -tzf "$TGZ" | sort
else
  echo "WARN: expected tgz not found: $TGZ"
  find "$ROOT/storage/tar" -type f -name "*plugin-nb-cloner*" 2>/dev/null || true
fi
