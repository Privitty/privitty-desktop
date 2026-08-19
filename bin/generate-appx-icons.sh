#!/usr/bin/env bash
# Regenerate MSIX/AppX tile icons from the Privitty app icon.
# Each existing PNG in build/appx/ is overwritten at its current dimensions.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE="$ROOT/packages/target-electron/build/icon.png"
APPX_DIR="$ROOT/packages/target-electron/build/appx"

if [[ ! -f "$SOURCE" ]]; then
  echo "Missing source icon: $SOURCE" >&2
  exit 1
fi

if [[ ! -d "$APPX_DIR" ]]; then
  echo "Missing AppX icon directory: $APPX_DIR" >&2
  exit 1
fi

for icon in "$APPX_DIR"/*.png; do
  width="$(sips -g pixelWidth "$icon" | awk '/pixelWidth:/{print $2}')"
  height="$(sips -g pixelHeight "$icon" | awk '/pixelHeight:/{print $2}')"
  sips -z "$height" "$width" "$SOURCE" --out "$icon" >/dev/null
  echo "✓ $(basename "$icon") (${width}x${height})"
done

echo "AppX icons regenerated from $SOURCE"
