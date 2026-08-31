#!/usr/bin/env bash
# Deploy Luma Reads to GitHub Pages (offline PWA for iPad).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

echo "Building static bundle in $TMP"
rsync -a --exclude node_modules --exclude .git --exclude '*.mjs' --exclude FEEDBACK.md \
  "$ROOT/" "$TMP/"
touch "$TMP/.nojekyll"

cd "$TMP"
git init -q
git checkout -b gh-pages 2>/dev/null || git checkout gh-pages
git add -A
git commit -q -m "Deploy Luma Reads offline PWA $(date -u +%Y-%m-%dT%H:%M:%SZ)" || true

REMOTE="${1:-origin}"
echo "Force-pushing to $REMOTE gh-pages"
git push -f "$REMOTE" gh-pages

echo "Done. iPad: open https://$(git -C "$ROOT" remote get-url "$REMOTE" 2>/dev/null | sed -E 's#.*github.com[:/]([^/]+/[^/.]+).*#\1#')/reading-trainer/ in Safari, then Add to Home Screen."
