#!/usr/bin/env bash
# check-stale — after editing @tuanla90/shared (or a plugin's src), list which plugins' built tgz are
# OUT OF DATE and must be rebuilt + re-uploaded. A plugin is STALE if @tuanla90/shared/dist is newer than
# its latest tgz, OR its own src changed since that tgz. Also prints the shared→consumer dep graph.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PKGROOT="$(cd "$ROOT/../packages/@tuanla90" && pwd)"
TAR="$ROOT/storage/tar/@tuanla90"
SHARED_DIST="$PKGROOT/shared/dist/index.mjs"

shared_mtime=$(stat -c %Y "$SHARED_DIST" 2>/dev/null || echo 0)
echo "== @tuanla90/shared/dist built: $(date -d @"$shared_mtime" '+%Y-%m-%d %H:%M:%S' 2>/dev/null) =="
echo ""
printf '%-40s %-8s %s\n' "PLUGIN (depends on @tuanla90/shared)" "STATUS" "REASON"
printf '%-40s %-8s %s\n' "----------------------------------------" "------" "------"

stale=0; total=0
for d in "$PKGROOT"/plugin-*; do
  [ -d "$d" ] || continue
  name=$(basename "$d")
  # only plugins that actually depend on @tuanla90/shared
  grep -q '@tuanla90/shared' "$d/package.json" 2>/dev/null || continue
  total=$((total+1))
  tgz=$(ls "$TAR/$name"-*.tgz 2>/dev/null | tail -1)
  if [ -z "$tgz" ]; then
    printf '%-40s %-8s %s\n' "$name" "NO-TGZ" "never built here"; stale=$((stale+1)); continue
  fi
  tgz_mtime=$(stat -c %Y "$tgz")
  reason=""
  if [ "$shared_mtime" -gt "$tgz_mtime" ]; then
    reason="@tuanla90/shared newer than tgz"
  elif [ -n "$(find "$d/src" -type f -newer "$tgz" 2>/dev/null | head -1)" ]; then
    reason="plugin src changed since tgz"
  fi
  if [ -n "$reason" ]; then
    printf '%-40s %-8s %s\n' "$name" "STALE" "$reason"; stale=$((stale+1))
  else
    printf '%-40s %-8s %s\n' "$name" "ok" ""
  fi
done

echo ""
echo "== $stale/$total plugin(s) STALE — rebuild + re-upload those. =="
echo "   rebuild:  bash recipes/run-<plugin>-build.sh  (then add-markers + deploy)"
