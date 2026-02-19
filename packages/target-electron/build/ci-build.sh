#!/usr/bin/env bash
# =============================================================================
# ci-build.sh
#
# Builds UNSIGNED release artifacts for CI.
# No Apple or Windows signing credentials are required.
# Artifacts are stored in dist/ and uploaded from CI.
# A developer then downloads them and runs sign-mac.sh / sign-win.ps1 locally.
#
# Usage:
#   bash build/ci-build.sh [mac|win|linux]
#
# Run from packages/target-electron directory.
# =============================================================================
set -euo pipefail

PLATFORM="${1:-}"
[ -z "$PLATFORM" ] && { echo "Usage: $0 [mac|win|linux]"; exit 1; }

log()  { echo "▶ $*"; }
die()  { echo "✘ $*" >&2; exit 1; }

log "Building Privitty – platform: $PLATFORM (unsigned)"

# ── Generate electron-builder config (always unsigned from CI) ────────────
case "$PLATFORM" in
  mac)
    log "Creating universal fat binaries with lipo..."
    node ./build/create-universal-bins.cjs

    log "Generating electron-builder config..."
    CSC_IDENTITY_AUTO_DISCOVERY=false UNIVERSAL_BUILD=true \
      node ./build/gen-electron-builder-config.js
    ;;
  win|linux)
    log "Generating electron-builder config..."
    CSC_IDENTITY_AUTO_DISCOVERY=false \
      node ./build/gen-electron-builder-config.js
    ;;
  *) die "Unknown platform '$PLATFORM'. Use: mac | win | linux" ;;
esac

# ── Patch node_modules for electron-builder ──────────────────────────────
log "Patching node_modules..."
node ../../bin/writeFlatDependencies.js packages/target-electron node_modules

# ── Build ─────────────────────────────────────────────────────────────────
case "$PLATFORM" in
  mac)
    log "Building unsigned universal macOS DMG..."
    CSC_IDENTITY_AUTO_DISCOVERY=false \
      electron-builder \
        --config ./electron-builder.json5 \
        --mac dmg \
        --universal \
        --publish never
    ;;
  win)
    log "Building unsigned Windows NSIS installer + portable..."
    CSC_IDENTITY_AUTO_DISCOVERY=false CSC_LINK="" \
      electron-builder \
        --config ./electron-builder.json5 \
        --win nsis portable \
        --publish never
    ;;
  linux)
    log "Building Linux AppImage + deb..."
    electron-builder \
      --config ./electron-builder.json5 \
      --linux AppImage deb \
      --publish never
    ;;
esac

log ""
log "═══════════════════════════════════════════════════════"
log " ✓ Build complete. Artifacts in: dist/"
log "   Next: download artifact, then run sign-mac.sh / sign-win.ps1 locally."
log "═══════════════════════════════════════════════════════"
