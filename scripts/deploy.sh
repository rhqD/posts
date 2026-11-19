#!/usr/bin/env bash
# Upload the static export to OSS with cache headers that make the CDN behave:
# hashed assets are immutable, HTML/RSC payloads are never cached.
#
# Usage: BUCKET=oss://renhanquan-site ./scripts/deploy.sh
# Requires: ossutil (v2) configured via `ossutil config`, and `pnpm build` already run.
set -euo pipefail

BUCKET="${BUCKET:-oss://renhanquan-site}"
DIST="${DIST:-out}"
CDN_DOMAIN="${CDN_DOMAIN:-}"
JOBS="${JOBS:-10}"
IMMUTABLE="public,max-age=31536000,immutable"
NO_CACHE="no-cache"

[ -d "$DIST" ] || { echo "missing $DIST — run 'pnpm build' first"; exit 1; }
[ -f "$DIST/index.html" ] || { echo "missing $DIST/index.html"; exit 1; }
[ -f "$DIST/404.html" ] || { echo "missing $DIST/404.html"; exit 1; }
command -v ossutil >/dev/null || { echo "ossutil not installed"; exit 1; }
YARD_MANIFEST=$(node -e 'const fs=require("node:fs"),crypto=require("node:crypto");const bytes=fs.readFileSync(process.argv[1]);process.stdout.write("lights."+crypto.createHash("sha256").update(bytes).digest("hex").slice(0,8)+".json")' "$DIST/yard/lights.json")
[ -f "$DIST/yard/$YARD_MANIFEST" ] || { echo "missing hashed yard manifest — run make sync-yard, then pnpm build"; exit 1; }
cmp -s "$DIST/yard/lights.json" "$DIST/yard/$YARD_MANIFEST" || { echo "yard manifest content/hash mismatch"; exit 1; }

echo "==> target: $BUCKET  source: $DIST ($(du -sh "$DIST" | cut -f1), $(find "$DIST" -type f | wc -l | tr -d ' ') files)"

# 1. Hashed assets first: a new HTML must never point at a missing file.
echo "==> _next/static (immutable)"
ossutil cp -r "$DIST/_next/static/" "$BUCKET/_next/static/" \
  --cache-control "$IMMUTABLE" -u -f -q -j "$JOBS"

echo "==> media (immutable)"
find "$DIST" -maxdepth 1 -type f \
  \( -name '*.jpg' -o -name '*.jpeg' -o -name '*.png' -o -name '*.webp' -o -name '*.svg' \
     -o -name '*.ico' -o -name '*.mp3' -o -name '*.woff2' -o -name '*.woff' \) \
  -print0 | xargs -0 -I{} ossutil cp "{}" "$BUCKET/" --cache-control "$IMMUTABLE" -u -f -q

echo "==> other static files"
ossutil cp -r "$DIST/" "$BUCKET/" --exclude "*.html" --exclude "*.txt" --exclude "*.xml" \
  --exclude "_next/*" --exclude "models/*" --exclude "yard/lights.json" --exclude "yard/lights.*.json" --cache-control "$IMMUTABLE" -u -f -q -j "$JOBS" || true

# Hashed manifests are mandatory resources of the new page. Publish them before
# documents and stop on any failure; leave old versions for open browser tabs.
for manifest in "$DIST"/yard/lights.*.json; do
  ossutil cp "$manifest" "$BUCKET/yard/" --cache-control "$IMMUTABLE" -f -q
done
# Compatibility for older viewers; new builds do not request this fixed URL.
ossutil cp "$DIST/yard/lights.json" "$BUCKET/yard/lights.json" --cache-control "$NO_CACHE" -f -q

# 2. Documents last: never cached.
echo "==> documents (no-cache)"
ossutil cp -r "$DIST/" "$BUCKET/" --include "*.html" --cache-control "$NO_CACHE" -u -f -q -j "$JOBS"
ossutil cp -r "$DIST/" "$BUCKET/" --include "*.txt"  --cache-control "$NO_CACHE" -u -f -q -j "$JOBS"
ossutil cp -r "$DIST/" "$BUCKET/" --include "*.xml"  --cache-control "$NO_CACHE" -u -f -q -j "$JOBS"

echo "==> done: $(ossutil du "$BUCKET" 2>/dev/null | tail -1)"

if [ -n "$CDN_DOMAIN" ]; then
  echo "==> verify"
  curl -sI "https://$CDN_DOMAIN/" | grep -iE 'cache-control|x-cache|age' || true
fi
