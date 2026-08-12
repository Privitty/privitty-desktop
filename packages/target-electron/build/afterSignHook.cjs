const { notarize, staple } = require('@electron/notarize')

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context
  if (electronPlatformName !== 'darwin') {
    return
  }

  const appName = context.packager.appInfo.productFilename
  const appPath = `${appOutDir}/${appName}.app`

  // appleApiKey must be a path to the .p8 file (set to $API_KEY_PATH in CI).
  // appleApiKeyId and appleApiIssuer are the App Store Connect API key details.
  const keyPath = process.env.appleApiKey
  const keyId = process.env.appleApiKeyId
  const issuerId = process.env.appleApiIssuer

  if (!keyPath || !keyId || !issuerId) {
    console.warn(
      '[afterSignHook] Skipping notarization — appleApiKey / appleApiKeyId / ' +
        'appleApiIssuer environment variables are not set.'
    )
    return
  }

  console.log(`[afterSignHook] Submitting ${appPath} to Apple notary service…`)
  await notarize({
    tool: 'notarytool',
    appPath,
    appleApiKey: keyPath,
    appleApiIssuer: issuerId,
    appleApiKeyId: keyId,
  })

  // Staple the notarization ticket so Gatekeeper can verify offline.
  console.log(`[afterSignHook] Stapling notarization ticket to ${appPath}…`)
  await staple(appPath)
  console.log('[afterSignHook] Notarization + staple complete ✓')
}
