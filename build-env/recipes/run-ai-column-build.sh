#!/usr/bin/env bash
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
NM="$ROOT/node_modules"
PKG="@tuanla90/plugin-ai-column"
echo "node: $(node -v)"
SRC="$ROOT/../packages/@tuanla90/plugin-ai-column"
DST="$ROOT/packages/plugins/@tuanla90/plugin-ai-column"
rm -rf "$DST"; mkdir -p "$DST"
cp -r "$SRC/src" "$DST/src"
cp "$SRC/package.json" "$DST/package.json"
# Markers (BUILD TRIGGERS): all three lanes. The classic `client` lane is REQUIRED even for a
# modern-only feature — the app resolves every enabled plugin's dist/client/index.js (a missing
# file 404s → requirejs "Script error" on /v/). The client.js/client-v2.js markers also land in
# the tgz so the server's hasClientEntry() can detect the lanes in the installed dir.
cp "$SRC/client.js" "$SRC/client-v2.js" "$SRC/server.js" "$DST/"
cp "$SRC/client.d.ts" "$SRC/client-v2.d.ts" "$SRC/server.d.ts" "$DST/"
mkstub() {
  local name="$1"; local ver="$2"
  if [ -f "$NM/$name/package.json" ]; then echo "keep real : $name"; return; fi
  mkdir -p "$NM/$name"; printf '{"name":"%s","version":"%s"}\n' "$name" "$ver" > "$NM/$name/package.json"; echo "stub      : $name@$ver"
}
# Stub for a package that's only ever imported via a SUBPATH (e.g. `pkg/client-v2`) — needs a
# real resolvable nested folder + an `exports` map, unlike the flat mkstub() above.
mkstubsub() {
  local name="$1"; local ver="$2"; local sub="$3"
  if [ -f "$NM/$name/$sub/package.json" ]; then echo "keep real : $name/$sub"; return; fi
  mkdir -p "$NM/$name/$sub"
  printf '{"name":"%s","version":"%s","main":"index.js","exports":{".":"./index.js","./%s":"./%s/index.js"}}\n' "$name" "$ver" "$sub" "$sub" > "$NM/$name/package.json"
  printf 'module.exports = {};\n' > "$NM/$name/$sub/index.js"
  printf 'module.exports = {};\n' > "$NM/$name/index.js"
  echo "stub(sub) : $name/$sub@$ver"
}
mkstub react 18.3.1
mkstub react-dom 18.3.1
mkstub antd 5.24.2
mkstub "@nocobase/client" 2.1.19
mkstub "@nocobase/client-v2" 2.1.19
mkstub "@nocobase/flow-engine" 2.1.19
mkstub "@nocobase/server" 2.1.19
mkstub "@formily/react" 2.3.7
mkstub "@formily/antd-v5" 2.3.7
mkstubsub "@nocobase/plugin-file-manager" 2.1.19 client-v2
mkstubsub "@nocobase/plugin-field-attachment-url" 2.1.19 client-v2
node "$NM/@nocobase/build/bin/nocobase-build.js" "$PKG" --tar --no-dts
echo "=== TAR OUTPUT ==="
TGZ=$(find "$ROOT/storage/tar" -type f -name "*ai-column*" 2>/dev/null | sort -V | tail -1)
echo "$TGZ"
# MANDATORY: nocobase-build --tar strips the root client.js/client-v2.js markers, so re-inject
# them. Without client-v2.js the server's hasClientEntry() returns false → /v/ never lists a
# clientV2Url → the modern client never loads this plugin → its flow-models (AiExtractFieldModel,
# PtdlBulk*ActionModel, …) go unregistered → "Model class not found" on any page using them.
if [ -n "$TGZ" ]; then
  bash "$ROOT/recipes/add-markers.sh" "$TGZ"
fi
