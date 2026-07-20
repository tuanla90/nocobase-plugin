#!/usr/bin/env bash
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
NM="$ROOT/node_modules"
PKG="@tuanla90/plugin-global-search"
PKGDIR="$ROOT/packages/plugins/$PKG"

# Sync src + version from the workspace (nguồn chân lý). This recipe builds the build-env COPY, so
# without this it silently ships stale source / the old version number (a known trap). Only the
# version field of package.json is synced (build-env copy may differ in devDeps).
SRC="$ROOT/../packages/@tuanla90/plugin-global-search"
mkdir -p "$PKGDIR"
if [ -d "$SRC/src" ]; then
  rm -rf "$PKGDIR/src"; cp -r "$SRC/src" "$PKGDIR/src"; cp "$SRC/package.json" "$PKGDIR/package.json"; cp "$SRC"/*.js "$SRC"/*.d.ts "$PKGDIR/" 2>/dev/null || true; echo "synced src <- $SRC"
fi
VERSRC=$(grep '"version"' "$SRC/package.json" | head -1 | sed 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
if [ -n "$VERSRC" ]; then
  sed -i -E "s/(\"version\"[[:space:]]*:[[:space:]]*\")[^\"]+(\")/\1$VERSRC\2/" "$PKGDIR/package.json"
  echo "synced version -> $VERSRC"
fi

echo "node: $(node -v)"

# Stub EXTERNAL framework deps (versions harvested from the running nb-local host 2.1.19)
# so dist/externalVersion.js matches the runtime. This plugin bundles NOTHING of its own —
# antd / @ant-design/icons / react / react-dom / @nocobase/* are all external.
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
# @tuanla90/shared's settingsKit imports @formily/react (observer/useForm) — stub it so nocobase-build
# externalizes it (the app provides it) instead of trying to bundle it.
mkstub "@formily/react" 2.3.7
mkstub "@formily/shared" 2.3.7
# @tuanla90/shared inlines `{ observer, useForm } from '@formily/react'` into this plugin's bundle
# (global-search uses lane-B primitives only, never these). The version-only stub has no entry, so
# rspack can't bundle it → give it a no-op resolvable entry (harmless dead code). Plugins that
# EXTERNALIZE @formily never touch this file.
FR="$NM/@formily/react"
if [ ! -f "$FR/index.js" ]; then
  printf 'var i=function(c){return c;};module.exports={observer:i,useForm:function(){return{};}};Object.defineProperty(module.exports,"__esModule",{value:true});\n' > "$FR/index.js"
  printf '{"name":"@formily/react","version":"2.3.7","main":"index.js"}\n' > "$FR/package.json"
  echo "shim      : @formily/react (no-op entry)"
fi
mkstub "@nocobase/client" 2.1.19
mkstub "@nocobase/client-v2" 2.1.19
mkstub "@nocobase/server" 2.1.19

node "$NM/@nocobase/build/bin/nocobase-build.js" "$PKG" --tar --no-dts

# nocobase-build collapses a server-only lane (no src/common) to dist/index.js instead of the
# dist/server/index.js that package.json "main" points at -> pm enable would fail. Relocate + repackage.
if [ ! -f "$PKGDIR/dist/server/index.js" ] && [ -f "$PKGDIR/dist/index.js" ]; then
  mkdir -p "$PKGDIR/dist/server"
  cp "$PKGDIR/dist/index.js" "$PKGDIR/dist/server/index.js"
  echo "fixup     : copied dist/index.js -> dist/server/index.js"
  node "$NM/@nocobase/build/bin/nocobase-build.js" "$PKG" --only-tar
fi

# /v/ modern client only loads a plugin's client-v2 lane when a `client-v2.js` marker sits at the
# package root; `nocobase-build --tar` does NOT pack markers -> inject them into the tgz.
# TRAP: never `find ... | head -1` here — once storage/tar has version history it grabs the OLDEST
# tgz and markers land on the wrong file, silently breaking /v/. Target the exact version built.
# (Parse the version with grep/sed, NOT `node -e require(<path>)` — a Git-Bash-style path like
# /d/Users/... isn't resolvable by Windows node and throws MODULE_NOT_FOUND.)
VER=$(grep '"version"' "$PKGDIR/package.json" | head -1 | sed 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
TGZ="$ROOT/storage/tar/$PKG-$VER.tgz"
if [ -f "$TGZ" ]; then
  bash "$ROOT/recipes/add-markers.sh" "$TGZ" || bash "$(dirname "$0")/add-markers.sh" "$TGZ" || true
else
  echo "WARN: expected tgz not found, markers NOT injected: $TGZ"
fi

echo "=== TAR OUTPUT ==="
find "$ROOT/storage/tar" -type f -name "*global-search*" 2>/dev/null || true
