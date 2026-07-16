#!/usr/bin/env bash
# Run the pure-core commission test. Bundles the TS with esbuild (from build-env) then runs with node.
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"          # repo root
ESBUILD="$ROOT/build-env/node_modules/.bin/esbuild"
OUT="$HERE/.bundle.cjs"
"$ESBUILD" "$HERE/commission.test.ts" --bundle --platform=node --format=cjs --outfile="$OUT" --log-level=warning
node "$OUT"
rm -f "$OUT"
