# Privitty – Build & Release Guide

## Overview

Releases follow a two-phase workflow:

| Phase             | Where             | What happens                                        |
| ----------------- | ----------------- | --------------------------------------------------- |
| **1. CI Build**   | GitHub Actions    | Compiles, packages, produces **unsigned** artifacts |
| **2. Local Sign** | Developer machine | Signs and notarizes the downloaded artifacts        |

Signing credentials never touch CI — they stay on your local machine.

---

## Prerequisites

### macOS signing machine

- Xcode Command Line Tools (`xcode-select --install`)
- Apple Developer account with a **Developer ID Application** certificate in your Keychain
- An **App-Specific Password** created at https://appleid.apple.com (not your regular password)
- Your 10-character **Team ID** from https://developer.apple.com/account

### Windows signing machine

- Windows SDK — provides `signtool.exe`:
  https://developer.microsoft.com/windows/downloads/windows-sdk/
- A code-signing certificate (`.pfx` file) **or** a hardware USB token (HSM)

### Linux

No signing step needed. AppImage and `.deb` packages are distributed as-is.

---

## Phase 1 – CI Build (GitHub Actions)

### Trigger automatically (recommended)

Push a version tag:

```bash
git tag v1.2.3
git push origin v1.2.3
```

### Trigger manually

Go to **Actions → Privitty – Build Release Artifacts → Run workflow** in GitHub UI.
You can optionally provide a version override (e.g. `1.2.3`).

### What CI produces

Three parallel jobs run and upload artifacts (retained 30 days):

| Job     | Artifact name               | Files                                                             |
| ------- | --------------------------- | ----------------------------------------------------------------- |
| macOS   | `privitty-macos-unsigned`   | `PrivittyChat-X.X.X-universal.dmg`                                |
| Windows | `privitty-windows-unsigned` | `PrivittyChat-Setup-X.X.X.exe`, `PrivittyChat-Portable-X.X.X.exe` |
| Linux   | `privitty-linux`            | `PrivittyChat-X.X.X.AppImage`, `privittychat_X.X.X_amd64.deb`     |

Download them from the Actions run page before the 30-day expiry.

---

## Phase 2 – Local Signing

### macOS

#### Set environment variables

```bash
export APPLE_ID="you@example.com"                # (developer.apple.com)
export APPLE_ID_PASSWORD="abcd-efgh-ijkl-mnop"   # app-specific password (appleid.apple.com → Security → App-Specific Passwords
)
export APPLE_TEAM_ID="ABCD123456"
export SIGNING_IDENTITY="Developer ID Application: Privitty Inc (ABCD123456)"
```

#### Run the signing script

```bash
cd packages/target-electron

bash build/sign-mac.sh dist/PrivittyChat-1.0.1-universal.dmg
# or via npm:
pnpm sign:mac dist/PrivittyChat-1.0.1-universal.dmg
```

What the script does, step by step:

1. Mounts the unsigned DMG and extracts the `.app`
2. Signs all nested binaries inside-out (frameworks, helpers, native servers)
3. Signs the main `.app` bundle with Hardened Runtime + entitlements
4. Creates a new DMG from the signed `.app`
5. Signs the DMG
6. Uploads to Apple for notarization (`xcrun notarytool`) and waits
7. Staples the notarization ticket

Output: `PrivittyChat-1.0.1-universal-signed.dmg` — ready for distribution.

---

### Windows

#### With a PFX certificate file

Run in PowerShell on your Windows machine:

```powershell
.\build\sign-win.ps1 `
    -InstallerPath "dist\PrivittyChat-Setup-1.0.1.exe" `
    -CertPath "C:\certs\privitty.pfx" `
    -CertPassword "your-pfx-password"
```

#### With a hardware USB token (HSM)

```powershell
.\build\sign-win.ps1 `
    -InstallerPath "dist\PrivittyChat-Setup-1.0.1.exe" `
    -UseHardwareToken
```

Sign both files (installer + portable):

```powershell
.\build\sign-win.ps1 -InstallerPath "dist\PrivittyChat-Setup-1.0.1.exe"    -CertPath ... -CertPassword ...
.\build\sign-win.ps1 -InstallerPath "dist\PrivittyChat-Portable-1.0.1.exe" -CertPath ... -CertPassword ...
```

Output: Same `.exe` files, signed in-place.

---

### Linux

No signing required. Distribute the `.AppImage` and `.deb` as downloaded.

---

## Local development builds (no CI, no signing)

### Quick single-arch builds (unsigned, for testing)

```bash
cd packages/target-electron

# Apple Silicon
pnpm pack:mac:arm64

# Intel
pnpm pack:mac:x64

# Windows (run on macOS/Linux with Wine, or on Windows)
pnpm pack:win

# Linux
pnpm pack:linux
```

### Universal macOS DMG (unsigned, for testing on both architectures)

```bash
cd packages/target-electron
pnpm pack:mac:universal
```

This:

1. Runs `lipo` to combine arm64 + x64 binaries into universal fat binaries
2. Generates config with `UNIVERSAL_BUILD=true`
3. Runs `electron-builder --mac dmg --universal`

Output: `dist/PrivittyChat-1.0.1-universal.dmg`

---

## File reference

| File                                     | Purpose                                                                                                   |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `build/create-universal-bins.cjs`        | Merges arm64+x64 binaries into fat binaries using `lipo`                                                  |
| `build/gen-electron-builder-config.js`   | Generates `electron-builder.json5`. Respects `CSC_IDENTITY_AUTO_DISCOVERY` and `UNIVERSAL_BUILD` env vars |
| `build/ci-build.sh`                      | Used by CI to build unsigned artifacts (called by the GitHub Actions workflow)                            |
| `build/sign-mac.sh`                      | Run locally to sign + notarize a macOS DMG                                                                |
| `build/sign-win.ps1`                     | Run locally to sign a Windows installer                                                                   |
| `build/afterPackHook.cjs`                | electron-builder post-pack hook: cleans up wrong-arch binaries, copies assets                             |
| `build/afterSignHook.cjs`                | electron-builder post-sign hook: notarizes (only runs when signing is enabled)                            |
| `build/entitlements.mac.plist`           | macOS Hardened Runtime entitlements                                                                       |
| `.github/workflows/privitty-release.yml` | GitHub Actions workflow that runs CI builds                                                               |

---

## Updating the app version

The version is set in `packages/target-electron/package.json`:

```json
{ "version": "1.0.1" }
```

Change it before tagging. The CI workflow also accepts a version override via `workflow_dispatch` so you can override without editing files.
