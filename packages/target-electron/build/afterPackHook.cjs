const { copyFileSync, existsSync } = require('fs')
const {
  readdir,
  writeFile,
  rm,
  copyFile,
  cp,
  mkdir,
  readFile,
} = require('fs/promises')
const { join } = require('path')

const { Arch } = require('electron-builder')
const { env } = require('process')

function convertArch(arch) {
  switch (arch) {
    case Arch.arm64:
      return 'arm64'
    case Arch.armv7l:
      return 'arm'
    case Arch.ia32:
      return 'ia32' // electron seems to not exist anymore anyway
    case Arch.x64:
      return 'x64'
    case Arch.universal:
      return 'universal'

    default:
      throw new Error(`unhandled architecture: ${arch}`)
  }
}

module.exports = async context => {
  const source_dir = join(__dirname, '..')

  console.log({ context, source_dir })
  const isMacBuild = ['darwin', 'mas', 'dmg'].includes(
    context.electronPlatformName
  )

  const resources_dir = join(
    context.appOutDir,
    isMacBuild
      ? `${context.packager.appInfo.sanitizedProductName}.app/Contents/Resources`
      : 'resources'
  )

  const prebuild_dir = join(
    resources_dir,
    '/app.asar.unpacked/node_modules/@deltachat'
  )

  // #region workaround for including prebuilds

  // workaround for pnpm and electron builder not working together nicely:
  // copy prebuild packages in manually
  // currently not needed

  // const stdioServerVersion = JSON.parse(
  //   await readFile(
  //     join(source_dir, '/node_modules/@privitty/deltachat-rpc-server/package.json')
  //   )
  // ).version

  // const workspaceNodeModules = join(source_dir, '../../node_modules')
  // const workspacePnpmModules = join(workspaceNodeModules, '.pnpm')
  // const dcStdioServers = (await readdir(workspacePnpmModules)).filter(
  //   name =>
  //     name.startsWith('@deltachat+stdio-rpc-server-') &&
  //     name.endsWith(stdioServerVersion)
  // )

  // console.log({ dcStdioServers })


  // for (const serverPackage of dcStdioServers) {
  //   const name = serverPackage.split('+')[1].split('@')[0]
  //   await cp(
  //     join(workspacePnpmModules, serverPackage),
  //     join(prebuild_dir, name),
  //     { recursive: true }
  //   )
  // }
  // #endregion

  // delete not needed prebuilds
  // ---------------------------------------------------------------------------------
  if (!env['NO_ASAR']) {
    await deleteNotNeededPrebuildsFromUnpackedASAR(
      prebuild_dir,
      context,
      isMacBuild
    )
  }

  // package msvc redist
  // ---------------------------------------------------------------------------------
  if (context.electronPlatformName === 'win32') {
    await packageMSVCRedist(context)
  }

  // copy map xdc
  // ---------------------------------------------------------------------------------
  // asar is electrons archive format, flatpak doesn't use it. read more about what asar is on https://www.electronjs.org/docs/latest/glossary#asar
  // asar is electrons archive format, flatpak doesn't use it. read more about what asar is on https://www.electronjs.org/docs/latest/glossary#asar
  const asar = env['NO_ASAR'] ? false : true
  await copyMapXdc(resources_dir, source_dir, asar)

  // Clean up unused platform-specific @privitty/privitty-core binaries
  // ---------------------------------------------------------------------------------
  await cleanupPrivittyBinaries(
    resources_dir,
    context,
    isMacBuild,
    env['NO_ASAR'] ? false : true
  )

  // Generic cleanup: remove all wrong-arch native packages from app.asar.unpacked.
  // This handles @parcel/watcher, @privitty/* and any other package that ships
  // arch-specific sub-packages (e.g. foo-darwin-arm64, bar-darwin-x64).
  // Without this, @electron/universal finds the same Mach-O binary in both the
  // x64-temp and arm64-temp slices and refuses to merge them.
  // ---------------------------------------------------------------------------------
  if (isMacBuild) {
    await cleanupWrongArchUnpackedModules(resources_dir, context)
  }
}

async function packageMSVCRedist(context) {
  const base = join(__dirname, 'vcredist/')
  const dir = await readdir(base)
  dir.forEach(d => {
    copyFileSync(join(base, d), join(context.appOutDir, d))
  })
  let windows_build_info = join(context.appOutDir, 'windows_build_info.json')

  let isAPPX = false

  if (context.targets.findIndex(({ name }) => name == 'appx') != -1) {
    if (context.targets.length > 1) {
      throw new Error("please don't build appx together with other formats")
    }

    // Set a file to indicate that it is an appx to the running app.
    isAPPX = true
  }

  await writeFile(
    windows_build_info,
    JSON.stringify({
      isAPPX,
    })
  )
}

async function copyMapXdc(resources_dir, source_dir, asar) {
  const destination = join(
    resources_dir,
    asar ? 'app.asar.unpacked' : 'app',
    'html-dist',
    'xdcs'
  )
  try {
    await mkdir(destination, { recursive: true })
  } catch (error) {
    console.log('failed to create dir', destination, error)
  }
  await cp(join(source_dir, 'html-dist/xdcs'), destination, { recursive: true })
}

async function cleanupPrivittyBinaries(
  resources_dir,
  context,
  isMacBuild,
  asar
) {
  const privitty_dir = join(
    resources_dir,
    asar ? 'app.asar.unpacked' : 'app',
    'node_modules',
    '.pnpm'
  )

  if (!existsSync(privitty_dir)) {
    console.log('privitty pnpm dir does not exist, skip cleanup:', privitty_dir)
    return
  }

  try {
    const entries = await readdir(privitty_dir)
    const privittyPackages = entries.filter(name =>
      name.startsWith('@privitty+privitty-core-')
    )

    const targetPlatform = context.electronPlatformName
    const targetArch = convertArch(context.arch)

    const toDelete = privittyPackages.filter(name => {
      // Extract platform and arch from package name: @privitty+privitty-core-darwin-arm64@version
      const parts = name.split('-')
      if (parts.length < 4) return false

      const pkgPlatform = parts[2] // darwin, linux, win32
      const pkgArchWithVersion = parts[3] // arm64@0.3.3 or x64@0.3.3
      const pkgArch = pkgArchWithVersion.split('@')[0] // arm64 or x64

      // Keep packages that match target platform and architecture
      if (pkgPlatform === targetPlatform && pkgArch === targetArch) {
        return false
      }

      // For mac universal builds, keep both arm64 and x64
      if (isMacBuild && (pkgArch === 'arm64' || pkgArch === 'x64')) {
        return false
      }

      return true
    })

    console.log('Privitty packages found:', privittyPackages)
    console.log('Privitty packages to delete:', toDelete)

    for (const targetOfDeletion of toDelete) {
      const fullPath = join(privitty_dir, targetOfDeletion)
      await rm(fullPath, { recursive: true, force: true })
      console.log('Deleted:', fullPath)
    }

    const remaining = privittyPackages.filter(p => !toDelete.includes(p))
    console.log('Remaining privitty packages:', remaining)
  } catch (error) {
    console.log('Failed to cleanup privitty binaries:', error)
  }
}

/**
 * Remove arch-specific packages from app.asar.unpacked so that both the
 * x64-temp and arm64-temp build slices end up with IDENTICAL file trees.
 *
 * @electron/universal's merge algorithm (v2+) requires every file in the
 * app bundle to exist at the SAME RELATIVE PATH in both slices. If even one
 * file is unique to a single slice the merge throws:
 *   "While trying to merge mach-o files … the number of mach-o files is not
 *    the same between the arm64 and x64 builds"
 * (The error message is misleading — the real check is: uniqueToX64.length
 *  !== 0 || uniqueToArm64.length !== 0, i.e. ANY file difference fails.)
 *
 * pnpm's supportedArchitectures installs packages for every declared OS/arch
 * combination (darwin/linux/win32 × x64/arm64).  All of these land in
 * app.asar.unpacked in every build slice, creating two failure modes:
 *
 *   A. Arch-specific packages at different paths:
 *      x64-temp has  …/@privitty/privitty-core-darwin-x64/privitty-server
 *      arm64-temp has …/@privitty/privitty-core-darwin-arm64/privitty-server
 *      → Different paths → unique to each slice → merge fails.
 *
 *   B. Asymmetric non-darwin packages:
 *      privitty-core publishes linux-x64 but NOT linux-arm64, so only the
 *      x64 slice has that package → again unique → merge fails.
 *
 * Solution for universal macOS builds (UNIVERSAL_BUILD=true):
 *   Remove ALL arch-specific packages from BOTH slices; keep ONLY
 *   *-darwin-universal packages (fat binaries created by the lipo step).
 *   Both slices then contain identical files → @electron/universal passes.
 *
 * Solution for single-arch macOS builds (UNIVERSAL_BUILD unset/false):
 *   Keep only darwin-{buildArch} packages; remove all others including
 *   linux-* and win32-*.
 *
 * Windows/Linux builds: remove packages for the opposite CPU arch only.
 * universal arch value: skip (merge already done by @electron/universal).
 *
 * Handles both scoped (@scope/pkg-darwin-arm64) and unscoped packages.
 */
async function cleanupWrongArchUnpackedModules(resources_dir, context) {
  const buildArch = convertArch(context.arch)
  const platform = context.electronPlatformName
  const isUniversalBuild = process.env.UNIVERSAL_BUILD === 'true'

  if (buildArch === 'universal') {
    console.log('cleanupWrongArchUnpackedModules: universal build, skipping')
    return
  }

  const unpacked_nm = join(resources_dir, 'app.asar.unpacked', 'node_modules')

  if (!existsSync(unpacked_nm)) {
    console.log(
      'cleanupWrongArchUnpackedModules: app.asar.unpacked/node_modules not found, skipping'
    )
    return
  }

  // Matches package names like: foo-darwin-x64, @scope/bar-linux-arm64
  const osArchSuffix = /-(darwin|linux|win32)-(x64|arm64|ia32|arm|universal)$/

  const shouldDelete = name => {
    const m = name.match(osArchSuffix)
    if (!m) return false // Not an arch-specific package — keep it

    const [, pkgOs, pkgArch] = m

    if (platform === 'darwin') {
      if (isUniversalBuild) {
        // Universal build: BOTH slices must have IDENTICAL file trees.
        // Keep ONLY darwin-universal (fat) packages; delete everything else
        // including darwin-x64, darwin-arm64, linux-*, win32-*.
        // @parcel/watcher-darwin-* also gets removed here — chokidar falls
        // back to fsevents (already bundled in Electron) on macOS.
        if (pkgOs !== 'darwin') return true // Remove non-darwin (linux, win32)
        return pkgArch !== 'universal' // Remove all non-fat darwin packages
      }

      // Single-arch build: keep only current-arch darwin packages.
      if (pkgOs !== 'darwin') return true // Remove non-darwin
      return pkgArch !== buildArch && pkgArch !== 'universal' // Remove wrong arch
    }

    // Non-macOS builds: remove packages for the opposite CPU arch only.
    const archToDelete = buildArch === 'x64' ? 'arm64' : 'x64'
    return (
      name.endsWith(`-darwin-${archToDelete}`) ||
      name.endsWith(`-linux-${archToDelete}`) ||
      name.endsWith(`-win32-${archToDelete}`)
    )
  }

  const deleted = []
  const topLevel = await readdir(unpacked_nm)

  for (const entry of topLevel) {
    if (entry.startsWith('@')) {
      const scopeDir = join(unpacked_nm, entry)
      let scoped
      try {
        scoped = await readdir(scopeDir)
      } catch {
        continue
      }
      for (const pkg of scoped) {
        if (shouldDelete(pkg)) {
          await rm(join(scopeDir, pkg), { recursive: true, force: true })
          deleted.push(`${entry}/${pkg}`)
        }
      }
    } else if (shouldDelete(entry)) {
      await rm(join(unpacked_nm, entry), { recursive: true, force: true })
      deleted.push(entry)
    }
  }

  if (deleted.length > 0) {
    console.log(
      `cleanupWrongArchUnpackedModules [${platform}/${buildArch} universal=${isUniversalBuild}]: removed:`,
      deleted
    )
  } else {
    console.log(
      `cleanupWrongArchUnpackedModules [${platform}/${buildArch} universal=${isUniversalBuild}]: nothing to remove`
    )
  }
}

async function deleteNotNeededPrebuildsFromUnpackedASAR(
  prebuild_dir,
  context,
  isMacBuild
) {
  if (!existsSync(prebuild_dir)) {
    console.log('prebuild_dir does not exist, skip cleanup:', prebuild_dir)
    return
  }
  const prebuilds = await readdir(prebuild_dir)

  const toDelete = prebuilds.filter(name => {
    const architecture = name.split('-')[4]
    
    // Keep meta-packages (they don't have architecture suffix)
    if (!architecture) {
      return false
    }
    
    if (architecture === convertArch(context.arch)) {
      return false
    } else if (
      // convertArch(context.arch) === 'universal' && does not work for some reason
      isMacBuild &&
      (architecture === 'arm64' || architecture === 'x64')
    ) {
      return false
    } else {
      return true
    }
  })

  console.log({ prebuilds, toDelete })

  for (const targetOfDeletion of toDelete) {
    await rm(join(prebuild_dir, targetOfDeletion), { recursive: true })
  }

  const prebuilds_after_cleanup = await readdir(prebuild_dir)
  console.log({ prebuilds_after_cleanup })
  if (prebuilds_after_cleanup.length !== 1 && !isMacBuild) {
    throw new Error(
      "prebuilds were not cleared correctly or prebuild is missing, there should only be one (unless it's mac)"
    )
  }
}
