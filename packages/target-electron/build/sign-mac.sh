#!/usr/bin/env bash
# =============================================================================
# sign-mac.sh
#
# Signs and notarizes a macOS DMG that was produced unsigned by CI.
# Run this locally on your macOS machine before releasing.
#
# Prerequisites:
#   - Xcode Command Line Tools installed (codesign, lipo, xcrun)
#   - "Developer ID Application" certificate in your login Keychain
#   - An App-Specific Password from https://appleid.apple.com
#
# Required environment variables (export before running, or put in .env.sign):
#   APPLE_ID            your-apple-id@example.com
#   APPLE_ID_PASSWORD   app-specific-password from appleid.apple.com
#   APPLE_TEAM_ID       10-character team ID from developer.apple.com
#   SIGNING_IDENTITY    "Developer ID Application: Your Company Name (TEAMID)"
#
# Usage:
#   export APPLE_ID="you@example.com"
#   export APPLE_ID_PASSWORD="abcd-efgh-ijkl-mnop"
#   export APPLE_TEAM_ID="ABCD123456"
#   export SIGNING_IDENTITY="Developer ID Application: Privitty Inc (ABCD123456)"
#   bash build/sign-mac.sh dist/PrivittyChat-1.0.0-universal.dmg
#
# Output:
#   PrivittyChat-1.0.0-universal-signed.dmg   (signed + notarized)
# =============================================================================
set -euo pipefail

UNSIGNED_DMG="${1:-}"
[ -z "$UNSIGNED_DMG" ]  && { echo "Usage: $0 <path-to-unsigned.dmg>"; exit 1; }
[ -f "$UNSIGNED_DMG" ]  || { echo "✘ File not found: $UNSIGNED_DMG";  exit 1; }

: "${APPLE_ID:?        set APPLE_ID env var}"
: "${APPLE_ID_PASSWORD:?set APPLE_ID_PASSWORD env var}"
: "${APPLE_TEAM_ID:?   set APPLE_TEAM_ID env var}"
: "${SIGNING_IDENTITY:?set SIGNING_IDENTITY env var (e.g. 'Developer ID Application: Privitty Inc (TEAMID)')}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENTITLEMENTS="$SCRIPT_DIR/entitlements.mac.plist"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

DMG_BASENAME="$(basename "${UNSIGNED_DMG%.dmg}")"
OUTPUT_DMG="${DMG_BASENAME}-signed.dmg"

log()  { echo "▶ $*"; }
step() { echo; echo "── $* ──────────────────────────────"; }
die()  { echo "✘ $*" >&2; exit 1; }

# ── Step 1: Extract .app from the unsigned DMG ───────────────────────────
step "1/5  Extracting .app from DMG"
MOUNT_POINT="$WORK_DIR/mnt"
mkdir -p "$MOUNT_POINT"

hdiutil attach "$UNSIGNED_DMG" \
  -mountpoint "$MOUNT_POINT" \
  -nobrowse -readonly -quiet

APP_NAME=$(find "$MOUNT_POINT" -maxdepth 1 -name "*.app" -type d | head -1 | xargs basename 2>/dev/null || true)
[ -z "$APP_NAME" ] && { hdiutil detach "$MOUNT_POINT" -quiet; die "No .app found in DMG"; }

log "Found: $APP_NAME"
cp -R "$MOUNT_POINT/$APP_NAME" "$WORK_DIR/$APP_NAME"
hdiutil detach "$MOUNT_POINT" -quiet

UNSIGNED_APP="$WORK_DIR/$APP_NAME"

# ── Step 2: Sign everything inside-out ───────────────────────────────────
step "2/5  Signing binaries (inside-out)"

CODESIGN_ARGS=(
  --force
  --options runtime
  --timestamp
  --sign "$SIGNING_IDENTITY"
  --entitlements "$ENTITLEMENTS"
)

sign_if_macho() {
  local f="$1"
  if file "$f" 2>/dev/null | grep -qE "Mach-O|executable|dylib"; then
    log "  signing: ${f#$UNSIGNED_APP/}"
    codesign "${CODESIGN_ARGS[@]}" "$f" 2>&1 || true
  fi
}

# 1. Individual dylibs and executables inside Frameworks (deepest first)
while IFS= read -r -d '' f; do
  sign_if_macho "$f"
done < <(find "$UNSIGNED_APP/Contents/Frameworks" -type f \( -name "*.dylib" -o -perm +111 \) -print0 2>/dev/null | sort -rz)

# 2. Framework bundles
while IFS= read -r -d '' fw; do
  log "  signing framework: ${fw#$UNSIGNED_APP/}"
  codesign "${CODESIGN_ARGS[@]}" "$fw" 2>&1 || true
done < <(find "$UNSIGNED_APP/Contents/Frameworks" -name "*.framework" -type d -print0 2>/dev/null)

# 3. Helper .app bundles
while IFS= read -r -d '' helper; do
  log "  signing helper: ${helper#$UNSIGNED_APP/}"
  codesign "${CODESIGN_ARGS[@]}" "$helper" 2>&1 || true
done < <(find "$UNSIGNED_APP/Contents" -name "*.app" -type d -print0 2>/dev/null)

# 4. Native binaries in Resources (privitty-server, deltachat-rpc-server, etc.)
while IFS= read -r -d '' bin; do
  sign_if_macho "$bin"
done < <(find "$UNSIGNED_APP/Contents/Resources" -type f -perm +111 -print0 2>/dev/null)

# 5. Sign the main .app bundle last
log "  signing main bundle: $APP_NAME"
codesign "${CODESIGN_ARGS[@]}" "$UNSIGNED_APP"

log "Verifying signature..."
codesign --verify --deep --strict "$UNSIGNED_APP" && log "  ✓ Signature valid"

# ── Step 3: Package into a new signed DMG ───────────────────────────────
step "3/5  Packaging into DMG"

STAGING="$WORK_DIR/staging"
mkdir -p "$STAGING"
cp -R "$UNSIGNED_APP" "$STAGING/"
ln -s /Applications "$STAGING/Applications"

hdiutil create \
  -volname "PrivittyChat" \
  -srcfolder "$STAGING" \
  -ov \
  -format UDZO \
  -imagekey zlib-level=9 \
  "$WORK_DIR/$OUTPUT_DMG"

log "Signing DMG..."
codesign \
  --force \
  --sign "$SIGNING_IDENTITY" \
  --timestamp \
  "$WORK_DIR/$OUTPUT_DMG"

# ── Step 4: Notarize ─────────────────────────────────────────────────────
step "4/5  Notarizing (uploading to Apple — this takes a few minutes)"

RESULT_JSON="$WORK_DIR/notarize.json"

xcrun notarytool submit "$WORK_DIR/$OUTPUT_DMG" \
  --apple-id       "$APPLE_ID" \
  --password       "$APPLE_ID_PASSWORD" \
  --team-id        "$APPLE_TEAM_ID" \
  --wait \
  --output-format json \
  | tee "$RESULT_JSON"

STATUS=$(node -p "require('$RESULT_JSON').status" 2>/dev/null || echo "unknown")
[ "$STATUS" = "Accepted" ] || die "Notarization failed with status: $STATUS"
log "  ✓ Notarization accepted"

# ── Step 5: Staple notarization ticket ───────────────────────────────────
step "5/5  Stapling notarization ticket"
xcrun stapler staple "$WORK_DIR/$OUTPUT_DMG"

cp "$WORK_DIR/$OUTPUT_DMG" "./$OUTPUT_DMG"

echo
echo "═══════════════════════════════════════════════════════"
echo " ✓  Ready for distribution: ./$OUTPUT_DMG"
echo "═══════════════════════════════════════════════════════"
