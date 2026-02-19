# =============================================================================
# sign-win.ps1
#
# Signs a Windows installer/portable produced unsigned by CI.
# Run this locally on a Windows machine before releasing.
#
# Prerequisites:
#   - Windows SDK (signtool.exe):
#     https://developer.microsoft.com/windows/downloads/windows-sdk/
#   - A code-signing certificate (.pfx file)  OR  a hardware USB token
#
# Usage — PFX certificate:
#   .\build\sign-win.ps1 `
#       -InstallerPath "dist\PrivittyChat-Setup-1.0.0.exe" `
#       -CertPath "C:\certs\privitty.pfx" `
#       -CertPassword "your-password"
#
# Usage — hardware USB token (certificate is on the token):
#   .\build\sign-win.ps1 `
#       -InstallerPath "dist\PrivittyChat-Setup-1.0.0.exe" `
#       -UseHardwareToken
#
# Both the NSIS installer and the portable exe can be signed.
# Run the script once per file.
# =============================================================================
param(
    [Parameter(Mandatory=$true)]
    [string]$InstallerPath,

    [string]$CertPath      = "",
    [string]$CertPassword  = "",
    [string]$TimestampUrl  = "http://timestamp.digicert.com",
    [switch]$UseHardwareToken
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Log  { Write-Host "▶ $args" }
function Step { Write-Host ""; Write-Host "── $args ────────────────────────" }
function Fail { Write-Error "✘ $args"; exit 1 }

# ── Locate signtool.exe ──────────────────────────────────────────────────
Step "Locating signtool.exe"
$signtool = $null

if (Get-Command "signtool.exe" -ErrorAction SilentlyContinue) {
    $signtool = "signtool.exe"
} else {
    $searchPaths = @(
        "${env:ProgramFiles(x86)}\Windows Kits\10\bin\*\x64\signtool.exe",
        "${env:ProgramFiles}\Windows Kits\10\bin\*\x64\signtool.exe"
    )
    foreach ($p in $searchPaths) {
        $found = Get-Item $p -ErrorAction SilentlyContinue `
                 | Sort-Object FullName -Descending `
                 | Select-Object -First 1
        if ($found) { $signtool = $found.FullName; break }
    }
}
$signtool ?? (Fail "signtool.exe not found. Install Windows SDK: https://developer.microsoft.com/windows/downloads/windows-sdk/")
Log "signtool: $signtool"

# ── Validate inputs ───────────────────────────────────────────────────────
Step "Validating inputs"
Test-Path $InstallerPath | Out-Null
if (-not (Test-Path $InstallerPath)) { Fail "File not found: $InstallerPath" }
if (-not $UseHardwareToken -and -not $CertPath) {
    Fail "-CertPath is required when not using -UseHardwareToken"
}
if ($CertPath -and -not (Test-Path $CertPath)) {
    Fail "Certificate file not found: $CertPath"
}

# ── Sign ─────────────────────────────────────────────────────────────────
Step "Signing: $InstallerPath"

$signArgs = @(
    "sign",
    "/fd",  "SHA256",
    "/td",  "SHA256",
    "/tr",  $TimestampUrl,
    "/d",   "Privitty",
    "/du",  "https://privitty.com"
)

if ($UseHardwareToken) {
    Log "Signing with hardware token"
} else {
    Log "Signing with PFX: $CertPath"
    $signArgs += @("/f", $CertPath, "/p", $CertPassword)
}

$signArgs += $InstallerPath

& $signtool @signArgs
if ($LASTEXITCODE -ne 0) { Fail "signtool exited with code $LASTEXITCODE" }

# ── Verify ────────────────────────────────────────────────────────────────
Step "Verifying signature"
& $signtool verify /pa /v $InstallerPath
if ($LASTEXITCODE -ne 0) { Fail "Signature verification failed" }

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════"
Write-Host " ✓  Signed: $InstallerPath"
Write-Host "    Ready for distribution."
Write-Host "═══════════════════════════════════════════════════════"
