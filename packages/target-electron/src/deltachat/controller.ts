import { app as rawApp, ipcMain } from 'electron'
import { EventEmitter } from 'events'
import { yerpc, BaseDeltaChat, T } from '@deltachat/jsonrpc-client'
import { getRPCServerPath } from '@deltachat/stdio-rpc-server'

import { getLogger } from '../../../shared/logger.js'
import * as mainWindow from '../../../frontend/src/components/windows/main.js'
import { ExtendedAppMainProcess } from '../types.js'
import DCWebxdc from './webxdc.js'
import { DesktopSettings } from '../desktop_settings.js'
import { StdioServer } from './stdio_server.js'
import rc_config from '../rc.js'
import { migrateAccountsIfNeeded } from './migration.js'

import { PrivittyClient } from '../privitty/client.js'

let dispName: string = ''

const app = rawApp as ExtendedAppMainProcess
const log = getLogger('main/deltachat')
const logCoreEvent = getLogger('core/event')

class ElectronMainTransport extends yerpc.BaseTransport {
  constructor(private sender: (message: yerpc.Message) => void) {
    super()
  }

  onMessage(message: yerpc.Message): void {
    this._onmessage(message)
  }

  _send(message: yerpc.Message): void {
    this.sender(message)
  }
}

export class JRPCDeltaChat extends BaseDeltaChat<ElectronMainTransport> {}

/**
 * DeltaChatController
 *
 * - proxy for a deltachat instance
 * - sends events to renderer
 * - handles events from renderer
 */
export default class DeltaChatController extends EventEmitter {
  /**
   * Created and owned by ipc on the backend
   */

  _inner_account_manager: StdioServer | null = null
  _inner_privitty_account_manager: PrivittyClient | null = null
  //_inner_is_privitty_vault_open: boolean = false
  _inner_globalPrivittyCounter: number = 0
  callbackMap = new Map<number, (response: any) => void>()

  get account_manager(): Readonly<StdioServer> {
    if (!this._inner_account_manager) {
      throw new Error('account manager is not defined (yet?)')
    }
    return this._inner_account_manager
  }

  get privitty_account_manager(): Readonly<PrivittyClient> {
    if (!this._inner_privitty_account_manager) {
      throw new Error('account manager is not defined (yet?)')
    }
    return this._inner_privitty_account_manager
  }

  getGlobalSequence(): number {
    return ++this._inner_globalPrivittyCounter
  }

  /** for runtime info */
  rpcServerPath?: string

  constructor(
    public cwd: string,
    public onPrivittyData: (reponse: string) => void
  ) {
    super()
  }

  _jsonrpcRemote: JRPCDeltaChat | null = null
  get jsonrpcRemote(): Readonly<JRPCDeltaChat> {
    if (!this._jsonrpcRemote) {
      throw new Error('_jsonrpcRemote is not defined (yet?)')
    }
    return this._jsonrpcRemote
  }

  async openPrivittyVault() {
    console.log('opening Privity Vault')
    const accountid: number =
      (await this.jsonrpcRemote.rpc.getSelectedAccountId()) || 0
    const accountInfo = await this.jsonrpcRemote.rpc.batchGetConfig(accountid, [
      'addr',
      'mail_pw',
    ])
    this._inner_privitty_account_manager?.createVault(
      accountid,
      dispName,
      accountInfo.addr || 'accountInfo_undifened',
      accountInfo.mail_pw || 'accountInfo_undifened',
      this.getGlobalSequence()
    )
  }

  sendPrivittyMessage(method: string, params: any) {
    return new Promise<string>((resolve, reject) => {
      let sequenceNumber = this.getGlobalSequence()
      this.callbackMap.set(sequenceNumber, response =>
        resolve(response as string)
      )
      this._inner_privitty_account_manager?.sendJsonRpcRequest(
        method,
        params,
        sequenceNumber,
      )
    })
  }

  async sendMessageToPeer(pdu: string, chatId: number) {
    console.log('sendMessageToPeer  ⚠️⚠️⚠️')
    console.log('PDU⚠️⛔️⛔️⚠️', pdu)
    console.log('PDU⚠️⛔️⛔️⚠️', chatId)

    try {
      const MESSAGE_DEFAULT: T.MessageData = {
        file: null,
        filename: null,
        viewtype: null,
        html: null,
        location: null,
        overrideSenderName: null,
        quotedMessageId: null,
        quotedText: null,
        text: null,
      }
      const message: Partial<T.MessageData> = {
        text: pdu,
        file: undefined,
        filename: undefined,
        quotedMessageId: null,
        viewtype: 'Text',
      }
      this.jsonrpcRemote.rpc.sendMsg(
        (await this.jsonrpcRemote.rpc.getSelectedAccountId()) || 0,
        chatId,
        { ...MESSAGE_DEFAULT, ...message }
      )
      console.log("➡️➡️➡️ MESSAGE SENT ➡️➡️➡️");
    } catch (e) {
      console.warn('sendMessageToPeer error', e)
    }
  }

  async privittyHandleIncomingMsg(response: string) {
    let sequenceNumber = this.getGlobalSequence()

    console.log('privittyHandleIn comingMsg', response)

    const responseObj = JSON.parse(response)

    const Msg = await this.jsonrpcRemote.rpc.getMessage(
      responseObj.result.contextId,
      responseObj.result.event.msgId
    )
    const chatInfo = await this.jsonrpcRemote.rpc.getBasicChatInfo(
      responseObj.result.contextId,
      responseObj.result.event.chatId
    )

    if (Msg.showPadlock && !chatInfo.isContactRequest) {
      if (!Msg.text || Msg.text.trim() === '') {
        console.log(
          '⛔️ Privitty check skipped — empty Msg.text (likely file or system message)',
          Msg
        )
        return
      }

      this.callbackMap.set(sequenceNumber, (response: string) => {
        this.handlePrivittyValidation(
          response,
          Msg,
          responseObj.result.event.chatId,
          responseObj.result.contextId
        )
      })

      this.privitty_account_manager.sendJsonRpcRequest(
        'isPrivittyMessage',
        { base64_data: Msg.text },
        sequenceNumber,
      )
    }
  }

  async handlePrivittyValidation(
    response: string,
    msg: any,
    chatId: number,
    ctx: number
  ) {
    let sequenceNumber = this.getGlobalSequence()
    const parsed = JSON.parse(response)

    if (!parsed?.result?.is_valid) return

    console.log("📥📥📥 RECEIVED INCOMING MESSAGE 📥📥📥", msg.text);
    this.callbackMap.set(sequenceNumber, (resp: string) => {
      try {
        const json = JSON.parse(resp)
        const pdu =  json?.result?.data?.pdu
        const targetChatId = Number(json?.result?.data?.chat_id)

        if (!pdu || !targetChatId) {
          console.error('Invalid processMessage response', json)
          return
        }

        this.sendMessageToPeer(pdu, targetChatId)
      } catch (err) {
        console.error('Failed to handle processMessage response', err)
      }
    })
        
    await this.privitty_account_manager.sendJsonRpcRequest(
      'processMessage',
      {
        event_data: {
          chat_id: String(chatId),
          pdu: msg.text,
          direction: String(0),
        },
      },
      sequenceNumber,
    )
  }

  async init() {
    log.debug('Check if legacy accounts need migration')
    if (await migrateAccountsIfNeeded(this.cwd, getLogger('migration'))) {
      // Clear some settings that we can't migrate
      DesktopSettings.update({
        lastAccount: undefined,
        lastChats: {},
        lastSaveDialogLocation: undefined,
      })
    }

    log.debug('Initiating DeltaChatNode')
    let serverPath = await getRPCServerPath({
      // Always allow environment override for local core usage
      disableEnvPath: false,
    })
    if (serverPath.includes('app.asar')) {
      // probably inside of electron build
      serverPath = serverPath.replace('app.asar', 'app.asar.unpacked')
    }

    this.rpcServerPath = serverPath
    log.info('using deltachat-rpc-server at', { serverPath })

    this._inner_account_manager = new StdioServer(
      response => {
        try {
          if (response.indexOf('"id":"main-') !== -1) {
            const message = JSON.parse(response)
            if (message.id.startsWith('main-')) {
              message.id = Number(message.id.replace('main-', ''))
              mainProcessTransport.onMessage(message)
              return
            }
          }
        } catch (error) {
          log.error('jsonrpc-decode', error)
        }
        if (response.indexOf('"kind":"IncomingMsg"') !== -1) {
          console.log('IncomingMsg =', response)
          this.privittyHandleIncomingMsg(response)
        }
        mainWindow.send('json-rpc-message', response)

        if (dispName == '' && response.indexOf('"kind":"Configured"') !== -1) {
          const message = JSON.parse(response)
          dispName = message.result.displayName
          console.log('displayName assign =', dispName)
        }

        if (response.indexOf('event') !== -1)
          try {
            const { result } = JSON.parse(response)
            const { contextId, event } = result
            if (
              contextId !== undefined &&
              typeof event === 'object' &&
              event.kind
            ) {
              if (event.kind === 'WebxdcRealtimeData') {
                return
              }
              if (event.kind === 'Warning') {
                logCoreEvent.warn(contextId, event.msg)
              } else if (event.kind === 'Info') {
                logCoreEvent.info(contextId, event.msg)
              } else if (event.kind.startsWith('Error')) {
                logCoreEvent.error(contextId, event.msg)
              } else if (
                event.kind === 'ImapConnected' //&& !this._inner_is_privitty_vault_open
              ) {
                this.openPrivittyVault()
              } else if (app.rc['log-debug']) {
                // in debug mode log all core events
                const event_clone = Object.assign({}, event) as Partial<
                  typeof event
                >
                delete event_clone.kind
                logCoreEvent.debug(contextId, event.kind, event)
              }
            }
          } catch (_error) {
            // ignore json parse errors
            return
          }
      },
      this.cwd,
      serverPath
    )

    log.info('Before Creating PrivittyClient')
    this._inner_privitty_account_manager = new PrivittyClient(
      response => {
        console.log('Privitty Controller', response)
        try {
          const resp = JSON.parse(response.trim())
          console.log('resp', resp)

          if (resp.id !== undefined && this.callbackMap.has(resp.id)) {
            console.log('we have sequence number 0077⛔️⛔️', resp.id)
            const resolve = this.callbackMap.get(resp.id)

            if (resolve) {
              console.log('just before calling response 0088⛔️⛔️')
              resolve(response)
            } else {
              console.warn('no resolve')
            }

            this.callbackMap.delete(resp.id)
          }
        } catch (error) {
          console.error('Failed to parse response: ⛔️⛔️', error)
        }
      },
      this.cwd,
      serverPath
    )
    log.info('HI')
    this.account_manager.start()
    console.log('this.account_manager.start() ⛔️')

    this.privitty_account_manager.start()
    console.log('this.privitty_account_manager.start() ⛔️')

    const version =
      this.privitty_account_manager.sendJsonRpcRequestWOP('getVersion')

    //todo? multiple instances, accounts is always writable

    const mainProcessTransport = new ElectronMainTransport(message => {
      message.id = `main-${message.id}`
      this.account_manager.send(JSON.stringify(message))
    })

    ipcMain.handle('json-rpc-request', (_ev, message) => {
      this.account_manager.send(message)
    })

    this._jsonrpcRemote = new JRPCDeltaChat(mainProcessTransport, false)

    if (DesktopSettings.state.syncAllAccounts) {
      log.info('Ready, starting accounts io...')
      this.jsonrpcRemote.rpc.startIoForAllAccounts()
      log.info('Started accounts io.')
    }
    for (const account of await this.jsonrpcRemote.rpc.getAllAccountIds()) {
      this.jsonrpcRemote.rpc.setConfig(
        account,
        'verified_one_on_one_chats',
        '1'
      )
    }
  }

  readonly webxdc = new DCWebxdc(this)
}
