#!/usr/bin/env bash
# typecheck.sh <plugin-dir (chứa src/)> — chặn lỗi "biến chưa khai báo / dùng ngoài scope" TRƯỚC khi build.
#
# VÌ SAO CẦN: @nocobase/build chỉ TRANSPILE (esbuild/rspack), KHÔNG typecheck. Một biến khai báo trong
# block nhưng được đọc ngoài block vẫn compile êm — thành free variable, và chỉ nổ ReferenceError lúc
# RUNTIME. Đây chính là vụ line-generator 0.8.0/0.8.1: `ruleCount: rules.length` đọc `rules` nằm trong
# nhánh else → mọi preview 500 "rules is not defined" trên production (test offline không phủ tới).
#
# CÁCH LỌC: chạy tsc --noEmit rồi CHỈ gate 3 mã lỗi scope (TS2304 Cannot find name, TS2448 use before
# declaration, TS2454 used before assigned). Mọi lỗi khác (TS2307 module not found, TS2339 property…,
# TS2580 require) là noise môi trường — build-env không cài @types/node lẫn framework thật — bỏ qua.
# Riêng TS2304 whitelist các global runtime CJS/Node luôn có: __dirname/__filename/require/module/
# process/Buffer/global/globalThis (thiếu @types/node nên tsc không biết chúng).
set -e
DIR="$1"
[ -n "$DIR" ] && [ -d "$DIR/src" ] || { echo "usage: typecheck.sh <plugin-dir chứa src/>"; exit 1; }
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TSC="$ROOT/node_modules/.bin/tsc"
[ -x "$TSC" ] || { echo "typecheck : SKIP (không thấy $TSC)"; exit 0; }

cd "$DIR"
FILES=$(find src -type f \( -name '*.ts' -o -name '*.tsx' \) ! -name '*.d.ts')
[ -n "$FILES" ] || { echo "typecheck : SKIP (không có file ts)"; exit 0; }

OUT=$("$TSC" --noEmit --skipLibCheck --jsx react --esModuleInterop --resolveJsonModule \
  --target es2020 --module commonjs --moduleResolution node --strict false $FILES 2>&1 || true)
BAD=$(echo "$OUT" | grep -E "error TS(2304|2448|2454)" \
  | grep -vE "Cannot find name '(__dirname|__filename|require|module|process|Buffer|global|globalThis)'" || true)

if [ -n "$BAD" ]; then
  echo "✗ TYPECHECK FAIL — biến chưa khai báo / dùng ngoài scope (sẽ thành ReferenceError lúc runtime):"
  echo "$BAD"
  exit 1
fi
echo "typecheck : OK (sạch lỗi scope TS2304/TS2448/TS2454)"
