#!/usr/bin/env bash
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
NM="$ROOT/node_modules"
PKG="@ptdl/plugin-quick-view"
PKGDIR="$ROOT/packages/plugins/$PKG"

# Sync src + version from the workspace (source of truth). Only the version field of package.json is
# synced (build-env copy may differ in devDeps).
SRC="$ROOT/../packages/@ptdl/plugin-quick-view"
if [ -d "$SRC/src" ]; then
  rm -rf "$PKGDIR/src"; cp -r "$SRC/src" "$PKGDIR/src"; echo "synced src <- $SRC"
fi
VERSRC=$(grep '"version"' "$SRC/package.json" | head -1 | sed 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
if [ -n "$VERSRC" ]; then
  sed -i -E "s/(\"version\"[[:space:]]*:[[:space:]]*\")[^\"]+(\")/\1$VERSRC\2/" "$PKGDIR/package.json"
  echo "synced version -> $VERSRC"
fi

# Keep the bundled @ptdl/shared current (ColumnSelect / setSharedT live there). Restore the whole
# package if it's absent (a stray `npm i` in build-env can prune it — it's not in package.json).
if [ ! -f "$NM/@ptdl/shared/package.json" ] && [ -d "$ROOT/../packages/@ptdl/shared" ]; then
  mkdir -p "$NM/@ptdl/shared"; cp -r "$ROOT/../packages/@ptdl/shared/package.json" "$ROOT/../packages/@ptdl/shared/dist" "$ROOT/../packages/@ptdl/shared/src" "$NM/@ptdl/shared/" 2>/dev/null || true
fi
if [ -d "$ROOT/../packages/@ptdl/shared/dist" ]; then
  mkdir -p "$NM/@ptdl/shared/dist"
  cp -r "$ROOT/../packages/@ptdl/shared/dist/." "$NM/@ptdl/shared/dist/"; echo "synced @ptdl/shared dist"
fi

echo "node: $(node -v)"

# Stub EXTERNAL framework deps (host = nb-local 2.1.19). This plugin bundles only @ptdl/shared;
# antd / icons / react / @nocobase/* (incl. flow-engine, whose `uid` we import) are all external.
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
mkstub "@nocobase/client" 2.1.19
mkstub "@nocobase/client-v2" 2.1.19
mkstub "@nocobase/server" 2.1.19
mkstub "@nocobase/flow-engine" 2.1.19
# NOTE: @ptdl/shared's settingsKit imports @formily/react + lucide-react at its module top level, so
# rspack must RESOLVE them even though we only use ColumnSelect/i18n (formily code tree-shakes out).
# These must be REAL packages in build-env node_modules (a name+version stub has no entry → "can't
# resolve"). Do NOT `npm i` them here — npm prunes the hand-built stubs + @ptdl/shared. They are
# already installed; fail loudly if a stray prune removed them.
for real in "@formily/react" "@formily/core" "@formily/reactive" "lucide-react"; do
  # real = package.json + other files; a bare stub has ONLY package.json. If a stub is found, try to
  # self-heal by copying the real package from nb-local (a fully-installed app) before giving up.
  if [ ! -f "$NM/$real/package.json" ] || [ "$(ls -A "$NM/$real" 2>/dev/null | grep -vc '^package.json$')" = "0" ]; then
    NLREAL="$ROOT/../nb-local/node_modules/$real"
    if [ -d "$NLREAL" ] && [ "$(ls -A "$NLREAL" | grep -vc '^package.json$')" != "0" ]; then
      rm -rf "$NM/$real"; cp -r "$NLREAL" "$NM/$real"; echo "restored real: $real (from nb-local)"
    else
      echo "FATAL: real package '$real' missing from build-env node_modules and nb-local. Install it real."; exit 1
    fi
  fi
done

node "$NM/@nocobase/build/bin/nocobase-build.js" "$PKG" --tar --no-dts

# server-only lane fixup (build may collapse to dist/index.js; main points at dist/server/index.js)
if [ ! -f "$PKGDIR/dist/server/index.js" ] && [ -f "$PKGDIR/dist/index.js" ]; then
  mkdir -p "$PKGDIR/dist/server"
  cp "$PKGDIR/dist/index.js" "$PKGDIR/dist/server/index.js"
  echo "fixup     : copied dist/index.js -> dist/server/index.js"
  node "$NM/@nocobase/build/bin/nocobase-build.js" "$PKG" --only-tar
fi

# Inject client.js / client-v2.js markers into the EXACT version tgz (never find|head -1).
VER=$(grep '"version"' "$PKGDIR/package.json" | head -1 | sed 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
TGZ="$ROOT/storage/tar/$PKG-$VER.tgz"
if [ -f "$TGZ" ]; then
  bash "$ROOT/recipes/add-markers.sh" "$TGZ" || true
else
  echo "WARN: expected tgz not found, markers NOT injected: $TGZ"
fi

echo "=== TAR OUTPUT ==="
find "$ROOT/storage/tar" -type f -name "*quick-view*" 2>/dev/null || true
