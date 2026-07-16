#!/usr/bin/env bash
# Build @ptdl/plugin-layout-containers (Tabs + Collapse block; classic + /v/ + server) into a tgz.
# (Renamed from run-block-tabs-build.sh — same structure, new package name.)
set -e
BE="$(cd "$(dirname "$0")/.." && pwd)"
NM="$BE/node_modules"
PKG="@ptdl/plugin-layout-containers"
SRC="$BE/../packages/$PKG"
DEST="$BE/packages/plugins/$PKG"

echo "node: $(node -v)"
rm -rf "$DEST"; mkdir -p "$DEST"
cp -r "$SRC/src" "$DEST/src"
cp "$SRC/package.json" "$DEST/"
cp "$SRC/client.js" "$SRC/client-v2.js" "$SRC/server.js" "$DEST/"
echo "staged   : $DEST"

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
mkstub "@ant-design/icons" 5.6.1
mkstub "@formily/react" 2.3.7
mkstub "@nocobase/client" 2.1.19
mkstub "@nocobase/client-v2" 2.1.19
mkstub "@nocobase/server" 2.1.19
mkstub "@nocobase/flow-engine" 2.1.19

cd "$BE"
node "$NM/@nocobase/build/bin/nocobase-build.js" "$PKG" --tar --no-dts

PKGDIR="$BE/packages/plugins/$PKG"
if [ ! -f "$PKGDIR/dist/server/index.js" ] && [ -f "$PKGDIR/dist/index.js" ]; then
  mkdir -p "$PKGDIR/dist/server"
  cp "$PKGDIR/dist/index.js" "$PKGDIR/dist/server/index.js"
  node "$NM/@nocobase/build/bin/nocobase-build.js" "$PKG" --only-tar
fi

# `$(dirname "$0")` is relative to the INVOKING cwd, but this recipe's helpers run after cwd moved →
# it resolved to build-env/build-env/... and failed silently (markers skipped). Use the absolute $BE.
# `sort -V` = version sort so 0.10 > 0.9 (plain sort would mis-pick).
TGZ=$(find "$BE/storage/tar" -type f -name "*layout-containers*.tgz" 2>/dev/null | sort -V | tail -1)
[ -n "$TGZ" ] && bash "$BE/recipes/add-markers.sh" "$TGZ" || true
echo "=== TAR OUTPUT ===" && echo "$TGZ"
