#!/usr/bin/env bash
# Build @tuanla90/shared (src -> dist CJS+ESM+dts) and sync into build-env/node_modules
# so consumer plugin builds resolve+bundle the fresh version.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
SHARED="$ROOT/../packages/@tuanla90/shared"
BIN="$ROOT/node_modules/.bin"

echo "=== build @tuanla90/shared ==="
# Framework deps stay EXTERNAL (the consumer plugin's build provides/externalizes them);
# shared must NOT bundle its own react/antd copy.
EXT="--external:react --external:react-dom --external:antd --external:@ant-design/icons --external:@nocobase/client --external:@nocobase/client-v2 --external:@nocobase/flow-engine --external:@formily/react --external:@formily/antd-v5 --external:lucide-react --external:dayjs"
"$BIN/esbuild" "$SHARED/src/index.ts" --bundle --format=cjs --platform=neutral $EXT --outfile="$SHARED/dist/index.js"
"$BIN/esbuild" "$SHARED/src/index.ts" --bundle --format=esm --platform=neutral $EXT --outfile="$SHARED/dist/index.mjs"
# Pure subpath: `@tuanla90/shared/format` (no react/antd) — for util-only consumers (data-viz, enhanced-table)
# so importing format helpers never pulls the antd-based color/icon/picker modules into their bundle.
"$BIN/esbuild" "$SHARED/src/format.ts" --bundle --format=cjs --platform=neutral --outfile="$SHARED/dist/format.js"
"$BIN/esbuild" "$SHARED/src/format.ts" --bundle --format=esm --platform=neutral --outfile="$SHARED/dist/format.mjs"
# Server-only subpath: `@tuanla90/shared/ai-server` (no react/antd) — the AI codegen helper a plugin's
# SERVER imports (getAiProvider / generateCode). Keep it out of the react barrel.
"$BIN/esbuild" "$SHARED/src/aiServer.ts" --bundle --format=cjs --platform=neutral --outfile="$SHARED/dist/aiServer.js"
"$BIN/esbuild" "$SHARED/src/aiServer.ts" --bundle --format=esm --platform=neutral --outfile="$SHARED/dist/aiServer.mjs"
"$BIN/tsc" "$SHARED/src/aiServer.ts" --declaration --emitDeclarationOnly --skipLibCheck \
  --moduleResolution bundler --module esnext --target es2019 --esModuleInterop --outDir "$SHARED/dist" || true
# `--jsx react-jsx` is REQUIRED: without it tsc throws TS6142 on every .tsx and skips its .d.ts
# (colorField/icons/fieldPicker/condition/settingsKit shipped untyped). `--moduleResolution bundler`
# lets it resolve the modern (exports-map) framework packages for the declaration types.
# `--resolveJsonModule` is REQUIRED for the shared locale (`import enUS from './locale/en-US.json'` in
# i18n.ts) — without it tsc errors on the JSON import and skips the .d.ts for the whole entry.
"$BIN/tsc" "$SHARED/src/index.ts" --declaration --emitDeclarationOnly --skipLibCheck \
  --jsx react-jsx --moduleResolution bundler --module esnext --target es2019 --esModuleInterop \
  --resolveJsonModule --outDir "$SHARED/dist" || true

echo "=== sync -> build-env/node_modules/@tuanla90/shared ==="
rm -rf "$ROOT/node_modules/@tuanla90/shared/dist"
mkdir -p "$ROOT/node_modules/@tuanla90/shared"
cp -r "$SHARED/dist" "$SHARED/package.json" "$ROOT/node_modules/@tuanla90/shared/"
echo "done: $(ls "$SHARED/dist")"
