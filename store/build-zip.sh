#!/usr/bin/env sh
# Builds the ZIP that is uploaded to the Chrome Web Store.
# Only the files the extension needs at runtime are included.
set -e
cd "$(dirname "$0")/.."
VERSION=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' manifest.json)
OUT="store/zenith-$VERSION.zip"
rm -f "$OUT"
zip -qr "$OUT" manifest.json newtab.html background.js css js data fonts icons/icon16.png icons/icon48.png icons/icon128.png sounds
echo "Created $OUT"
