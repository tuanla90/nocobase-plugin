#!/usr/bin/env bash
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
NM="$ROOT/node_modules"
PKG="@tuanla90/plugin-spreadsheet-view"

echo "node: $(node -v)"

SRC="$ROOT/../packages/@tuanla90/plugin-spreadsheet-view"
DST="$ROOT/packages/plugins/@tuanla90/plugin-spreadsheet-view"

rm -rf "$DST"
mkdir -p "$DST"
cp -r "$SRC/src" "$DST/src"
cp "$SRC/package.json" "$DST/package.json"
cp "$SRC/client.js" "$SRC/client-v2.js" "$SRC/server.js" "$DST/"
cp "$SRC/client.d.ts" "$SRC/client-v2.d.ts" "$SRC/server.d.ts" "$DST/"

# Gate lỗi scope (TS2304/2448/2454) trước khi build — builder chỉ transpile, không typecheck.
# (Đã bắt được vụ `token` free-variable 0.2.5: sort arrow / group label / sticky stack nổ ReferenceError.)
bash "$ROOT/recipes/typecheck.sh" "$DST"

mkstub() {
  local name="$1"; local ver="$2"
  if [ -f "$NM/$name/package.json" ]; then echo "keep real : $name"; return; fi
  mkdir -p "$NM/$name"
  printf '{"name":"%s","version":"%s"}\n' "$name" "$ver" > "$NM/$name/package.json"
  echo "stub      : $name@$ver"
}
# externals — stub only; ag-grid-community/ag-grid-react are REAL in $NM (bundled)
mkstub react 18.3.1
mkstub react-dom 18.3.1
mkstub antd 5.24.2
mkstub "@ant-design/icons" 5.6.1
# @formily/react bị import từ BÊN TRONG @tuanla90/shared (đã bundle) nên không được externalize
# (externalize chỉ áp cho import trực tiếp từ source plugin) → stub phải RESOLVE được:
# index.js rỗng, phần dùng formily (SettingsGrid) không được plugin này import nên tree-shake bỏ.
mkdir -p "$NM/@formily/react"
printf '{"name":"@formily/react","version":"2.3.7","main":"index.js","sideEffects":false}\n' > "$NM/@formily/react/package.json"
printf 'module.exports = {};\n' > "$NM/@formily/react/index.js"
echo "stub+idx  : @formily/react"
# @formily/antd-v5: FormTab được IMPORT TRỰC TIẾP trong source (spreadsheet.tsx) → nocobase-build
# externalize (không bundle) vì nằm trong allowlist. Chỉ cần package.json để resolve lúc scan.
mkstub "@formily/antd-v5" 2.3.7
mkstub "@nocobase/client" 2.1.19
mkstub "@nocobase/client-v2" 2.1.19
mkstub "@nocobase/flow-engine" 2.1.19
mkstub "@nocobase/server" 2.1.19

# Dep thật (bundle). node_modules của build-env hay bị dọn — tự phục hồi từ vendor/aggrid/*.tgz.
restore_real() {
  local name="$1"; local tgz="$2"
  if [ -f "$NM/$name/package.json" ]; then echo "have real : $name"; return; fi
  local V="$ROOT/vendor/aggrid"
  if [ ! -f "$V/$tgz" ]; then echo "MISSING real dep: $name (no $V/$tgz)"; exit 1; fi
  local TMP="$V/.x"; rm -rf "$TMP"; mkdir -p "$TMP"
  tar -xzf "$V/$tgz" -C "$TMP" --force-local
  mkdir -p "$(dirname "$NM/$name")"; mv "$TMP/package" "$NM/$name"; rm -rf "$TMP"
  echo "restored  : $name"
}
# @tuanla90/shared: lib source dùng chung (bundle vào plugin) — sync thẳng từ workspace mỗi lần build.
rm -rf "$NM/@tuanla90/shared"
mkdir -p "$NM/@tuanla90"
cp -r "$ROOT/../packages/@tuanla90/shared" "$NM/@tuanla90/shared"
echo "synced    : @tuanla90/shared"

restore_real ag-grid-community ag-grid-community-36.0.0.tgz
restore_real ag-grid-react ag-grid-react-36.0.0.tgz
restore_real ag-stack ag-stack-36.0.0.tgz
restore_real ag-charts-types ag-charts-types-14.0.0.tgz
restore_real prop-types prop-types-15.8.1.tgz
restore_real react-is react-is-16.13.1.tgz
# Ép CJS (ESM của ag-grid vỡ rspack linking) — idempotent.
node -e "
const fs=require('fs');
for (const name of ['ag-grid-community','ag-grid-react','ag-stack']) {
  const p = process.argv[1]+'/'+name+'/package.json';
  const j = JSON.parse(fs.readFileSync(p,'utf8'));
  if (j.module || (j.exports && j.exports['.'] && j.exports['.'].import)) {
    delete j.module;
    if (j.exports && j.exports['.']) { const d=j.exports['.']; j.exports['.']={ types:d.types, default:(d.require||d.default) }; }
    fs.writeFileSync(p, JSON.stringify(j,null,2)); console.log('cjs-forced', name);
  }
}" "$NM"

node "$NM/@nocobase/build/bin/nocobase-build.js" "$PKG" --tar --no-dts

echo "=== TAR OUTPUT ==="
find "$ROOT/storage/tar" -type f -name "*spreadsheet*" 2>/dev/null || true

# inject /v/ + /admin client-lane markers (client.js/client-v2.js) — NocoBase skips client bundles without them.
__TGZ=$(find "$ROOT/storage/tar" -type f -name "$(basename "$PKG")-*.tgz" 2>/dev/null | sort -V | tail -1)
if [ -n "$__TGZ" ]; then bash "$ROOT/recipes/add-markers.sh" "$__TGZ"; fi
