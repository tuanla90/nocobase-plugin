#!/usr/bin/env bash
# Deploy the built plugin into the running nb-local (fast iteration loop). See [reference_nb_local_deploy].
#   - copies the tar's dist + root markers into nb-local/node_modules/@tuanla90/plugin-line-generator
#   - pm2 restart index
# FIRST install of a brand-new plugin: after this copy, ENABLE it once — either upload the .tgz via
# Plugin Manager UI (Add & Update -> Upload -> Enable), or `pm add`+`pm enable` via the CLI. The
# plugin's own collection (ptdl_linegen_rules) is created by .sync() in load() on first enable.
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"                 # repo root
NB="$ROOT/../nb-local"
PKG="@tuanla90/plugin-line-generator"
DEST="$NB/node_modules/$PKG"
TGZ=$(find "$ROOT/build-env/storage/tar/@tuanla90" -name 'plugin-line-generator-*.tgz' | sort -V | tail -1)

[ -f "$TGZ" ] || { echo "No tgz — run build-env/recipes/run-line-generator-build.sh first"; exit 1; }
[ -d "$NB" ] || { echo "nb-local not found at $NB"; exit 1; }
echo "deploy: $TGZ -> $DEST"

W=$(mktemp -d); tar -xzf "$TGZ" -C "$W"
mkdir -p "$DEST"
rm -rf "$DEST/dist"
cp -r "$W/dist" "$DEST/dist"
cp "$W/package.json" "$DEST/package.json"
for f in client.js client-v2.js server.js; do [ -f "$W/$f" ] && cp "$W/$f" "$DEST/$f"; done
rm -rf "$W"
echo "copied. dist server size: $(ls -la "$DEST/dist/shared/vendor/formulajs.browser.js" | awk '{print $5}') (vendor)"

"$NB/node_modules/.bin/pm2" restart index >/dev/null 2>&1 && echo "pm2 restart index: ok" || echo "pm2 restart failed — restart manually"
echo "Done. If first install: enable @tuanla90/plugin-line-generator (Plugin Manager UI or CLI), then hard-refresh."
