import { app as rawApp, Menu, Tray, nativeImage, NativeImage } from 'electron'
import { globalShortcut } from 'electron'
import { join, dirname, resolve } from 'path'
import { existsSync } from 'fs'
import { fileURLToPath } from 'url'

import * as mainWindow from '../../frontend/src/components/windows/main.js'
import { ExtendedAppMainProcess } from './types.js'
import { getLogger } from '../../shared/logger.js'
import { DesktopSettings } from './desktop_settings.js'
import { tx } from './load-translations.js'
import { htmlDistDir } from './application-constants.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

let tray: Tray | null = null
let contextMenu: Menu | null = null

const app = rawApp as ExtendedAppMainProcess
const log = getLogger('main/tray')

let has_unread = false

function loadNativeImage(path: string): NativeImage | null {
  if (!existsSync(path)) {
    log.warn('Tray icon file not found', { path })
    return null
  }
  const image = nativeImage.createFromPath(path)
  if (image.isEmpty()) {
    log.warn('Tray icon failed to load (empty image)', { path })
    return null
  }
  return image
}

function resolveTrayIconPath(baseName: string): string[] {
  const trayIconFolder = resolve(htmlDistDir(), 'images/tray')
  if (process.platform === 'win32') {
    return [
      join(trayIconFolder, `${baseName}.ico`),
      join(trayIconFolder, `${baseName}.png`),
    ]
  }
  if (process.platform === 'darwin') {
    return [join(trayIconFolder, 'tray-icon-mac.png')]
  }
  return [join(trayIconFolder, `${baseName}.png`)]
}

function TrayImage(): NativeImage | null {
  if (process.platform === 'darwin') {
    const macPath = resolveTrayIconPath('tray-icon-mac')[0]
    const image = loadNativeImage(macPath)
    if (!image) return null
    const resized = image.resize({ width: 24 })
    resized.setTemplateImage(true)
    return resized
  }

  const baseName = has_unread ? 'privittychat-unread' : 'privittychat'
  for (const path of resolveTrayIconPath(baseName)) {
    const image = loadNativeImage(path)
    if (image) return image
  }

  log.error(
    'No tray icon could be loaded. Run `pnpm validate:images` and `pnpm -w build:electron`.',
    { trayIconFolder: resolve(htmlDistDir(), 'images/tray') }
  )
  return null
}

export function set_has_unread(new_has_unread: boolean) {
  has_unread = new_has_unread
  if (tray) {
    const image = TrayImage()
    if (image) tray.setImage(image)
  }
}

function mainWindowIsVisible() {
  if (!mainWindow.window) {
    throw new Error('window does not exist, this should never happen')
  }
  if (process.platform === 'darwin' || process.platform === 'win32') {
    return mainWindow.window.isVisible()
  }
  return mainWindow.window.isVisible() && mainWindow.window.isFocused()
}

export function hideDeltaChat(minimize?: boolean) {
  if (!mainWindow.window) {
    throw new Error('window does not exist, this should never happen')
  }
  if (minimize === true) {
    mainWindow.window.minimize()
  }
  mainWindow.window.hide()
  if (process.platform === 'linux') tray?.setContextMenu(getTrayMenu() as Menu)
}

export function showDeltaChat() {
  if (!mainWindow.window) {
    throw new Error('window does not exist, this should never happen')
  }
  mainWindow.window.show()
}

function hideOrShowDeltaChat() {
  mainWindowIsVisible() ? hideDeltaChat(true) : showDeltaChat()
}

export function quitDeltaChat() {
  globalShortcut.unregisterAll()
  app.quit()
}

export function updateTrayIcon() {
  // User doesn't want tray icon => destroy it
  if (!app.rc['minimized'] && DesktopSettings.state.minimizeToTray !== true) {
    if (tray != null) destroyTrayIcon()
    return
  }

  renderTrayIcon()
}

function destroyTrayIcon() {
  log.info('destroy icon tray')
  tray?.destroy()
  tray = null
}

function getTrayMenu() {
  if (tray === null) return
  if (process.platform === 'darwin') {
    contextMenu = Menu.buildFromTemplate([
      mainWindowIsVisible()
        ? {
            id: 'reduce_window',
            label: tx('hide'),
            type: 'normal',
            click() {
              hideDeltaChat()
              // fix #3041
              refreshTrayContextMenu()
            },
          }
        : {
            id: 'open_windows',
            label: tx('activate'),
            type: 'normal',
            click() {
              showDeltaChat()
              // fix #3041
              refreshTrayContextMenu()
            },
          },

      {
        id: 'quit_app',
        label: tx('global_menu_file_quit_desktop'),
        type: 'normal',
        click() {
          quitDeltaChat()
        },
      },
    ])
  } else {
    // is windows/linux
    contextMenu = Menu.buildFromTemplate([
      {
        id: 'open_windows',
        label: tx('global_menu_file_open_desktop'),
        type: 'normal',
        click() {
          showDeltaChat()
        },
      },
      {
        id: 'reduce_window',
        label: tx('global_menu_minimize_to_tray'),
        type: 'normal',
        enabled: mainWindowIsVisible(),
        click() {
          hideDeltaChat()
        },
      },
      {
        id: 'quit_app',
        label: tx('global_menu_file_quit_desktop'),
        type: 'normal',
        click() {
          quitDeltaChat()
        },
      },
    ])
  }

  return contextMenu
}

function TrayIcon(): Tray | null {
  const image = TrayImage()
  if (!image) return null
  return new Tray(image)
}

function renderTrayIcon() {
  if (tray != null) {
    log.warn('Tray icon not destroyed before render?')
    destroyTrayIcon()
  }

  log.info('add icon tray')
  try {
    tray = TrayIcon()
  } catch (err) {
    log.error('Failed to create tray icon, continuing without tray', err)
    tray = null
    return
  }
  if (!tray) return

  tray.setToolTip('Privitty Chat')

  if (process.platform === 'darwin') {
    tray.on('click', () => tray?.popUpContextMenu(getTrayMenu()))
    tray.on('right-click', () => tray?.popUpContextMenu(getTrayMenu()))
  } else if (process.platform === 'win32') {
    tray.on('click', hideOrShowDeltaChat)
    tray.on('right-click', () => tray?.popUpContextMenu(getTrayMenu()))
  } else {
    tray.on('click', hideOrShowDeltaChat)
    tray.on('double-click', hideOrShowDeltaChat)

    refreshTrayContextMenu()
  }
}

export function refreshTrayContextMenu() {
  tray?.setContextMenu(getTrayMenu() as Menu)
}
