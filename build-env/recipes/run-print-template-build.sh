#!/usr/bin/env bash
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
NM="$ROOT/node_modules"
PKG="@ptdl/plugin-print-template"
echo "node: $(node -v)"

# Stage source + markers (markers at the STAGED package root are the lane build triggers!)
SRC="$ROOT/../packages/@ptdl/plugin-print-template"
DST="$ROOT/packages/plugins/@ptdl/plugin-print-template"
rm -rf "$DST"; mkdir -p "$DST"
cp -r "$SRC/src" "$DST/src"
cp "$SRC/package.json" "$DST/package.json"
cp "$SRC/client.js" "$SRC/client-v2.js" "$SRC/server.js" "$DST/"
cp "$SRC/client.d.ts" "$SRC/client-v2.d.ts" "$SRC/server.d.ts" "$DST/"

# handlebars + qrcode-generator + jszip must be REAL (bundled into the client lanes).
for real in handlebars qrcode-generator jszip; do
  if [ ! -f "$NM/$real/package.json" ]; then
    echo "$real missing in build-env — run: (cd build-env && npm install)"
    exit 1
  fi
  echo "keep real : $real"
done

# @ptdl/shared is a workspace package npm prunes on every install — restore it from
# packages/ so the build can resolve/bundle it.
SHARED_SRC="$ROOT/../packages/@ptdl/shared"
if [ ! -f "$NM/@ptdl/shared/package.json" ] || [ "$SHARED_SRC/dist/index.js" -nt "$NM/@ptdl/shared/dist/index.js" ]; then
  mkdir -p "$NM/@ptdl"
  rm -rf "$NM/@ptdl/shared"
  cp -r "$SHARED_SRC" "$NM/@ptdl/shared"
  echo "restored  : @ptdl/shared"
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
# Target the EXACT version just built — never `find | head -1` (once storage/tar has history it
# grabs the OLDEST tgz, so markers + lazy assets land on the wrong file and the new tgz ships
# incomplete: no /v/ marker, no grapes/alasql/pagedjs). See nocobase-build-marker-tgz-trap.
VER=$(grep '"version"' "$DST/package.json" | head -1 | sed 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
TGZ="$ROOT/storage/tar/$PKG-$VER.tgz"
echo "$TGZ"
if [ -n "$TGZ" ]; then
  bash "$ROOT/recipes/add-markers.sh" "$TGZ"
  # Repack lazy-loaded static libs into the tgz (NOT bundled):
  #  - dist/alasql.min.js          (~500KB, helper `sql`)
  #  - dist/paged.polyfill.min.js  (Paged.js, option "Hiện số trang")
  #  - dist/grapes/*               (GrapesJS visual editor + preset/blocks + css)
  for lib in "alasql/dist/alasql.min.js" "pagedjs/dist/paged.polyfill.min.js" \
             "html2pdf.js/dist/html2pdf.bundle.min.js" "jszip/dist/jszip.min.js" \
             "grapesjs/dist/grapes.min.js" "grapesjs/dist/css/grapes.min.css" \
             "grapesjs-preset-webpage/dist/index.js" "grapesjs-blocks-basic/dist/index.js"; do
    if [ ! -f "$NM/$lib" ]; then echo "MISSING $NM/$lib — npm install in build-env first"; exit 1; fi
  done
  W=$(mktemp -d); ( cd "$W" && mkdir pk && tar -xzf "$TGZ" --force-local -C pk 2>/dev/null || tar -xzf "$TGZ" -C pk )
  cp "$NM/alasql/dist/alasql.min.js" "$W/pk/dist/alasql.min.js"
  cp "$NM/pagedjs/dist/paged.polyfill.min.js" "$W/pk/dist/paged.polyfill.min.js"
  cp "$NM/html2pdf.js/dist/html2pdf.bundle.min.js" "$W/pk/dist/html2pdf.bundle.min.js"
  cp "$NM/jszip/dist/jszip.min.js" "$W/pk/dist/jszip.min.js"
  mkdir -p "$W/pk/dist/grapes"
  cp "$NM/grapesjs/dist/grapes.min.js" "$W/pk/dist/grapes/grapes.min.js"
  cp "$NM/grapesjs/dist/css/grapes.min.css" "$W/pk/dist/grapes/grapes.min.css"
  cp "$NM/grapesjs-preset-webpage/dist/index.js" "$W/pk/dist/grapes/preset-webpage.js"
  cp "$NM/grapesjs-blocks-basic/dist/index.js" "$W/pk/dist/grapes/blocks-basic.js"
  ( cd "$W/pk" && tar -czf ../out.tgz $(ls -A) ) && cp "$W/out.tgz" "$TGZ"
  rm -rf "$W"
  echo "added: alasql + pagedjs + grapes assets -> $TGZ"
  echo "--- tgz contents ---"
  tar -tzf "$TGZ" | grep -E "^(client|dist/(client|client-v2|server)/index.js|dist/alasql)" | head -10
fi
