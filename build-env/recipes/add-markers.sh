#!/usr/bin/env bash
# Nhồi marker client.js / client-v2.js vào tgz đã build.
#
# VÌ SAO CẦN: NocoBase modern client (/v/) chỉ nạp lane client-v2 của plugin nào có
# file marker `client-v2.js` Ở GỐC package (server check: @nocobase/server
# .../plugin-manager/options/resource.js -> hasClientEntry -> PLUGIN_CLIENT_MARKER_FILES).
# Lệnh `nocobase-build --tar` KHÔNG đóng marker vào tgz -> /v/ bỏ qua client-v2 ->
# code client-v2 (vd đăng ký icon Lucide vào picker) không bao giờ chạy.
# Chạy script này SAU mỗi lần build --tar.
#
# Dùng: bash add-markers.sh path/to/plugin-<name>-<ver>.tgz
set -e
TGZ="$1"; [ -f "$TGZ" ] || { echo "usage: add-markers.sh <tgz>"; exit 1; }
W=$(mktemp -d); cp "$TGZ" "$W/a.tgz"; ( cd "$W" && mkdir pk && tar -xzf a.tgz -C pk )
R="$W/pk"; ADDED=""
if [ -f "$R/dist/client/index.js" ] && [ ! -f "$R/client.js" ]; then
  printf "module.exports = require('./dist/client/index.js');\n" > "$R/client.js"; ADDED="client.js"; fi
if [ -f "$R/dist/client-v2/index.js" ] && [ ! -f "$R/client-v2.js" ]; then
  printf "module.exports = require('./dist/client-v2/index.js');\n" > "$R/client-v2.js"; ADDED="$ADDED client-v2.js"; fi
if [ -n "$ADDED" ]; then ( cd "$R" && tar -czf ../out.tgz $(ls -A) ) && cp "$W/out.tgz" "$TGZ"; echo "added:$ADDED -> $TGZ"; else echo "no client lane / already present: $TGZ"; fi
rm -rf "$W"
