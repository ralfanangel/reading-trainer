#!/usr/bin/env bash
# Deploy Luma Reads to GitHub Pages (offline PWA for iPad).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

echo "Building static bundle in $TMP"
cp -a "$ROOT/index.html" "$ROOT/style.css" "$ROOT/app.js" "$ROOT/sw-boot.js" \
  "$ROOT/service-worker.js" "$ROOT/manifest.json" "$ROOT/apple-touch-icon.png" \
  "$ROOT/avatar.svg" "$ROOT/animals.json" "$ROOT/fonts" "$ROOT/icons" "$TMP/"
touch "$TMP/.nojekyll"

cd "$TMP"
git init -q
git checkout -b gh-pages
git add -A
git commit -q -m "Deploy Luma Reads offline PWA $(date -u +%Y-%m-%dT%H:%M:%SZ)"

REMOTE="${1:-origin}"
REMOTE_URL=$(git -C "$ROOT" remote get-url "$REMOTE")
git remote add deploy "$REMOTE_URL"
echo "Force-pushing to $REMOTE gh-pages"
git push -f deploy gh-pages

REPO=$(git -C "$ROOT" remote get-url "$REMOTE" 2>/dev/null | sed -E 's#.*github.com[:/]([^/]+/[^/.]+)(\.git)?#\1#')
echo "Done. iPad Safari: https://${REPO}/reading-trainer/ → Share → Add to Home Screen"
