import { resolve, join, dirname } from 'path'
import { getLogger } from '@deltachat-desktop/shared/logger'
import { ChildProcessWithoutNullStreams, spawn } from 'child_process'
import { getLogsPath } from '../application-constants'
import { arch, platform } from 'os'
import { app, dialog } from 'electron/main'
import { existsSync, readdirSync } from 'fs'
import { fileURLToPath } from 'url'

import * as T from '@deltachat/jsonrpc-client/dist/generated/types.js'
// import { Credentials } from '../../../frontend/src/types-app'
// import { BackendRemote } from '../../../frontend/src/backend-com'
const log = getLogger('Privitty')

export class PrivittyClient {
  // Get absolute path of the C++ binary
  _cmd_path = ''

  serverProcess: ChildProcessWithoutNullStreams | null
  pendingRequests: any
  constructor(
    public on_data: (reponse: string) => void,
    public accounts_path: string,
    private _cmd_path?: string
  ) {
    this.serverProcess = null
    this.pendingRequests = new Map();
    this._cmd_path = this.computeCmdPath()
  }

  private computeCmdPath() {
    try {
      const binaryPath = this.findPrivittyBinaryInPnpm()
      log.info('Found privitty binary at:', binaryPath)
      return binaryPath
    } catch (error) {
      log.error('Failed to find privitty binary in pnpm store:', error)
      // Fallback to local binaries for development
      const binName = process.platform === 'win32'
        ? 'privitty_jsonrpc_server.exe'
        : 'privitty-server'

      if (app.isPackaged) {
        const fallbackPath = join(process.resourcesPath, 'privitty', 'dll', binName)
        log.warn('Using fallback path for packaged app:', fallbackPath)
        return fallbackPath
      }

      const appRoot = app.getAppPath()
      const devPath = resolve(appRoot, 'privitty/dll', binName)
      log.warn('Using fallback path for development:', devPath)
      return devPath
    }
  }

  private findPrivittyBinaryInPnpm(): string {
    const platformName = platform()
    const archName = arch()
    
    let packageName: string
    let binaryName: string
    
    if (platformName === 'darwin') {
      if (archName === 'arm64' || archName === 'x64') {
        packageName = `@privitty/privitty-core-darwin-${archName}`
        binaryName = 'privitty-server'
      } else {
        throw new Error(`Unsupported macOS architecture: ${archName}`)
      }
    } else if (platformName === 'linux') {
      if (archName === 'x64') {
        packageName = '@privitty/privitty-core-linux-x64'
        binaryName = 'privitty-server'
      } else {
        throw new Error(`Unsupported Linux architecture: ${archName}`)
      }
    } else if (platformName === 'win32') {
      if (archName === 'x64') {
        packageName = '@privitty/privitty-core-win32-x64'
        binaryName = 'privitty-server.exe'
      } else {
        throw new Error(`Unsupported Windows architecture: ${archName}`)
      }
    } else {
      throw new Error(`Unsupported platform: ${platformName}`)
    }
    
    // In packaged apps, look in app.asar.unpacked
    if (app.isPackaged) {
      const unpackedPath = join(
        process.resourcesPath,
        'app.asar.unpacked',
        'node_modules',
        packageName,
        binaryName
      )
      if (existsSync(unpackedPath)) {
        return unpackedPath
      }
    }
    
    // In development, search in pnpm store
    const __dirname = dirname(fileURLToPath(import.meta.url))
    
    const pnpmStorePaths = [
      join(__dirname, '../../../node_modules/.pnpm'),
      join(__dirname, '../../../../node_modules/.pnpm'),
      join(__dirname, '../../../../../node_modules/.pnpm'),
    ]
    
    for (const pnpmStore of pnpmStorePaths) {
      if (!existsSync(pnpmStore)) continue
      
      try {
        const entries = readdirSync(pnpmStore)
        const packageEntry = entries.find(entry => 
          entry.startsWith(packageName.replace('@', '@').replace('/', '+'))
        )
        
        if (packageEntry) {
          const binaryPath = join(
            pnpmStore,
            packageEntry,
            'node_modules',
            packageName,
            binaryName
          )
          
          if (existsSync(binaryPath)) {
            return binaryPath
          }
        }
      } catch (error) {
        // Continue to next path
      }
    }
    
    throw new Error(
      `Platform-specific package not found: ${packageName}. ` +
      `Platform: ${platformName}, Architecture: ${archName}`
    )
  }

  start() {
    // cmd_path is already computed in constructor, no need to recompute
    log.info('Starting privitty-server from:', this._cmd_path)
    this.serverProcess = spawn(this._cmd_path, {
      cwd: this.accounts_path, // Set working directory to writable accounts path
      env: {
        RUST_LOG: process.env.RUST_LOG,
        PRIVITTY_ACCOUNTS_PATH: this.accounts_path, // Pass accounts path as env var
      },
    })

    this.serverProcess.on('error', err => {
      // The 'error' event is emitted whenever:
      // - The process could not be spawned.
      // - The process could not be killed.
      // - Sending a message to the child process failed.
      // - The child process was aborted via the signal option.
      // ~ https://nodejs.org/api/child_process.html#event-error

      if (err.message.endsWith('ENOENT')) {
        dialog.showErrorBox(
          'Fatal Error: Privitty Library Missing',
          `The Privitty Module is missing! This could be due to your antivirus program. Please check the quarantine to restore it and notify the developers about this issue.
            You can reach us at 
            
            The missing module should be located at "${this._cmd_path}".
            
            The Log file is located in this folder: ${getLogsPath()}
            --------------------
            Error: ${err.message}
            `
        )
      } else {
        dialog.showErrorBox(
          'Fatal Error',
          `Error with Privitty has been detected, please contact developers: You can reach us on  .
  
            ${err.name}: ${err.message}
  
            The Log file is located in this folder: ${getLogsPath()}\n
            `
        )
      }
      // I think we can exit in all the cases, because all errors here are serious
      app.exit(1)
    })

    let buffer = '';

    this.serverProcess.stdout.on('data', data => {
      buffer += data.toString();

      // Process full lines
      while (buffer.includes('\n')) {
        const n = buffer.indexOf('\n');
        const line = buffer.substring(0, n).trim();
        buffer = buffer.substring(n + 1);

        if (!line.startsWith('{')) continue;

        try {
          this.on_data(line);
        } catch (e) {
          console.error('JSON parse error:', e, line);
        }
      }
    });

    // some kind of "buffer" that the text in the error dialog does not get too long
    let errorLog = ''
    const ERROR_LOG_LENGTH = 800
    this.serverProcess.stderr.on('data', data => {
      log.error(`privitty client stderr: ${data}`.trimEnd())
      errorLog = (errorLog + data).slice(-ERROR_LOG_LENGTH)
    })

    this.serverProcess.on('close', (code, signal) => {
      if (code !== null) {
        log.info(`child process close all stdio with code ${code}`)
      } else {
        log.info(`child process close all stdio with signal ${signal}`)
      }
    })

    this.serverProcess.on('exit', (code, signal) => {
      if (code !== null) {
        log.info(`child process exited with code ${code}`)
        if (code !== 0) {
          log.critical('Fatal: The Delta Chat Core exited unexpectedly', code)
          dialog.showErrorBox(
            'Fatal Error',
            `[privitty Version: ${
              '1.0'
              //BuildInfo.VERSION
            } | ${platform()} | ${arch()}]\nThe privitty lib has exited unexpectedly with code ${code}\n${errorLog}`
          )
          app.exit(1)
        }
      } else {
        log.warn(`child process exited with signal ${signal}`)
      }
    })
  }

  send(message: string) {
    this.serverProcess?.stdin.write(message + '\n')
  }

  sendJsonRpcRequest(method: string, params: any = {}, requestId?: number,): Promise<any> {
  const request = {
    jsonrpc: "2.0",
    method,
    params,
    id: requestId,
  };

  return new Promise((resolve) => {
    this.pendingRequests.set(requestId, resolve);
    this.serverProcess?.stdin.write(JSON.stringify(request) + '\n');
  });
}


  // Function to send JSON-RPC requests
  sendJsonRpcRequestWOP(method: string, requestId: number) {
    const request = JSON.stringify({ jsonrpc: '2.0', method, id: requestId })
    this.serverProcess?.stdin.write(request + '\n')
  }

  createVault(
    accountID: T.U32,
    userName: string,
    addr: string,
    mail_pw: string,
    requestId: number
  ) {
    this.sendJsonRpcRequest('switchProfile',{
      username: userName,
      user_email: addr,
      user_id: String(accountID)
    },
    requestId)
    this.sendJsonRpcRequest('getSystemState');
    this.sendJsonRpcRequest('getHealth');
  }

  /**
   * Stop the privitty-server process
   * Called when the app is shutting down
   */
  stop() {
    if (this.serverProcess) {
      log.info('Stopping privitty-server process')
      try {
        this.serverProcess.kill()
        this.serverProcess = null
      } catch (error) {
        log.error('Error killing privitty-server process:', error)
      }
    }
  }
}
