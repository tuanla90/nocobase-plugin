#!/usr/bin/env bash
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
NM="$ROOT/node_modules"
PKG="@tuanla90/plugin-mailer"
echo "node: $(node -v)"

# Stage source + lane markers from the workspace (source of truth).
SRC="$ROOT/../packages/@tuanla90/plugin-mailer"
DST="$ROOT/packages/plugins/@tuanla90/plugin-mailer"
rm -rf "$DST"; mkdir -p "$DST"
cp -r "$SRC/src" "$DST/src"
cp "$SRC/package.json" "$DST/package.json"
cp "$SRC/README.md" "$DST/README.md" 2>/dev/null || true
cp "$SRC/client.js" "$SRC/client-v2.js" "$SRC/server.js" "$DST/"
cp "$SRC/client.d.ts" "$SRC/client-v2.d.ts" "$SRC/server.d.ts" "$DST/"

# Stub EXTERNAL framework deps at nb-local (2.1.19) versions. @tuanla90/shared is BUNDLED (must be a real
# resolvable package in node_modules — refreshed by run-shared-build.sh). nodemailer / handlebars /
# qrcode-generator are BUNDLED server deps and must be REAL (they are, in build-env/node_modules) so the
# build compiles them into dist/node_modules — same as file-vault's jszip. mkstub only stubs when absent,
# so it never clobbers a real dep.
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
mkstub "@formily/antd-v5" 2.3.7
mkstub "@nocobase/plugin-workflow" 2.1.19

node "$NM/@nocobase/build/bin/nocobase-build.js" "$PKG" --tar --no-dts

# server-only lane fixup (build may collapse to dist/index.js; main points at dist/server/index.js)
if [ ! -f "$DST/dist/server/index.js" ] && [ -f "$DST/dist/index.js" ]; then
  mkdir -p "$DST/dist/server"
  cp "$DST/dist/index.js" "$DST/dist/server/index.js"
  [ -f "$DST/dist/plugin.js" ] && cp "$DST/dist/plugin.js" "$DST/dist/server/plugin.js"
  echo "fixup     : copied dist/index.js -> dist/server/index.js"
  node "$NM/@nocobase/build/bin/nocobase-build.js" "$PKG" --only-tar
fi

# nodemailer bundling proof (like file-vault's jszip): server deps compile into dist/node_modules/<pkg>.
echo "=== BUNDLED SERVER DEPS (expect nodemailer + handlebars) ==="
ls "$DST/dist/node_modules" 2>/dev/null || echo "WARN: no dist/node_modules — server deps did not bundle!"

echo "=== TAR OUTPUT ==="
VER=$(grep '"version"' "$DST/package.json" | head -1 | sed 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
TGZ="$ROOT/storage/tar/$PKG-$VER.tgz"
if [ ! -f "$TGZ" ]; then
  echo "WARN: expected tgz not found: $TGZ"
else
  bash "$ROOT/recipes/add-markers.sh" "$TGZ" || true
  # Repack the lazy-loaded GrapesJS visual-editor assets into the tgz (NOT webpack-bundled — the editor
  # loads them at runtime from /static/plugins/@tuanla90/plugin-mailer/dist/grapes/, the SAME script-loading
  # mechanism plugin-print-template uses). Shipping our own copy keeps the mailer self-contained.
  for lib in "grapesjs/dist/grapes.min.js" "grapesjs/dist/css/grapes.min.css" \
             "grapesjs-preset-webpage/dist/index.js" "grapesjs-blocks-basic/dist/index.js"; do
    if [ ! -f "$NM/$lib" ]; then echo "MISSING $NM/$lib — (cd build-env && npm install) first"; exit 1; fi
  done
  W=$(mktemp -d); ( cd "$W" && mkdir pk && tar -xzf "$TGZ" --force-local -C pk 2>/dev/null || tar -xzf "$TGZ" -C pk )
  mkdir -p "$W/pk/dist/grapes"
  cp "$NM/grapesjs/dist/grapes.min.js" "$W/pk/dist/grapes/grapes.min.js"
  cp "$NM/grapesjs/dist/css/grapes.min.css" "$W/pk/dist/grapes/grapes.min.css"
  cp "$NM/grapesjs-preset-webpage/dist/index.js" "$W/pk/dist/grapes/preset-webpage.js"
  cp "$NM/grapesjs-blocks-basic/dist/index.js" "$W/pk/dist/grapes/blocks-basic.js"
  ( cd "$W/pk" && tar -czf ../out.tgz $(ls -A) ) && cp "$W/out.tgz" "$TGZ"
  rm -rf "$W"
  echo "added: grapes assets -> $TGZ"
  echo "--- grapes assets in tgz ---"; tar -tzf "$TGZ" --force-local 2>/dev/null | grep "dist/grapes/" || echo "WARN: grapes not in tgz!"
fi
find "$ROOT/storage/tar" -type f -name "*plugin-mailer*" 2>/dev/null || true
