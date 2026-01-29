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
import {
  PRV_APP_STATUS_FORWARD_PDU,
  PRV_APP_STATUS_FORWARD_SPLITKEYS_REQUEST,
  PRV_APP_STATUS_FORWARD_SPLITKEYS_REVOKED,
  PRV_APP_STATUS_GROUP_ADD_ACCEPTED,
  PRV_APP_STATUS_PEER_ADD_COMPLETE,
  PRV_APP_STATUS_PEER_ADD_CONCLUDED,
  PRV_APP_STATUS_PEER_OTSP_SPLITKEYS,
  PRV_APP_STATUS_PEER_SPLITKEYS_DELETED,
  PRV_APP_STATUS_PEER_SPLITKEYS_REQUEST,
  PRV_APP_STATUS_PEER_SPLITKEYS_RESPONSE,
  PRV_APP_STATUS_PEER_SPLITKEYS_REVOKED,
  PRV_APP_STATUS_PEER_SPLITKEYS_UNDO_REVOKED,
  PRV_APP_STATUS_RELAY_BACKWARD_SPLITKEYS_RESPONSE,
  PRV_APP_STATUS_RELAY_FORWARD_SPLITKEYS_REQUEST,
  PRV_APP_STATUS_REVERT_FORWARD_SPLITKEYS_REQUEST,
  PRV_APP_STATUS_SEND_PEER_PDU,
  PRV_APP_STATUS_VAULT_IS_READY,
  PRV_EVENT_RECEIVED_PEER_PDU,
} from '../privitty/privitty_type.js'
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
    console.log('accountid =', accountid)
    console.log('accountInfo =', accountInfo)
    console.log('DisplayName =', dispName)
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
  // async onPrivittyAddPeerCB(response: string) {
  //   //{"jsonrpc":"2.0","message_type":8,"chatId":24,"seqNo":5,"pdu":[8,2,18,133,4,10,16,49,55,52,55,57,54,50,54,48,54,95,49,46,112,110,103,18,9,105,109,97,103,101,47,112,110,103,26,229,3,137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,12,0,0,0,15,8,2,0,0,0,95,131,185,30,0,0,1,172,73,68,65,84,40,21,99,84,101,112,101,32,4,24,245,217,60,190,253,250,203,128,23,48,170,50,184,50,16,2,140,170,12,174,12,96,192,200,198,196,194,195,172,195,249,199,76,252,159,16,23,195,85,54,238,61,95,56,126,222,253,250,239,219,31,70,85,6,87,6,6,6,38,86,70,190,32,57,254,0,105,143,155,143,93,174,60,98,96,96,248,198,198,214,225,103,252,237,63,211,247,75,31,24,85,25,92,37,181,217,21,210,76,159,201,49,0,65,212,241,219,70,247,94,48,128,193,49,53,201,117,166,42,12,12,12,140,182,169,245,214,170,207,124,190,100,205,81,63,241,132,235,149,247,165,135,142,151,31,49,48,48,124,99,99,237,241,50,249,196,203,196,35,249,154,177,104,113,189,208,211,107,150,247,76,249,37,18,219,53,166,21,109,62,206,253,251,15,3,3,195,53,25,225,37,62,114,34,154,183,216,120,191,50,94,78,45,217,39,253,72,254,153,128,201,117,245,151,226,183,152,25,238,50,128,193,125,21,182,173,21,191,24,152,24,128,128,241,190,125,193,57,157,39,130,95,254,8,127,254,254,159,233,47,3,24,252,97,99,216,149,202,112,207,152,1,2,24,47,132,184,48,160,130,127,76,204,243,38,253,253,193,197,0,7,140,23,66,92,24,144,192,63,102,230,13,197,127,95,168,49,252,99,98,128,3,198,107,94,97,191,184,222,253,101,98,253,200,253,79,234,153,44,251,119,222,251,134,127,151,53,95,99,128,129,175,215,69,24,159,153,214,255,97,253,246,139,149,101,147,235,109,213,123,194,198,151,165,24,24,24,110,90,188,95,218,122,229,251,61,193,55,219,84,132,143,72,51,206,204,200,118,184,41,194,251,133,233,11,215,175,229,1,151,181,111,137,153,92,150,62,111,250,253,220,59,193,141,103,228,125,141,31,104,42,188,7,0,232,0,152,43,247,243,17,98,0,0,0,0,73,69,78,68,174,66,96,130,18,212,3,10,16,49,55,52,55,57,54,50,54,48,54,95,50,46,112,110,103,18,9,105,109,97,103,101,47,112,110,103,26,180,3,137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,15,0,0,0,13,8,2,0,0,0,249,124,163,22,0,0,1,123,73,68,65,84,40,21,99,212,94,52,75,224,250,77,166,235,124,12,96,224,195,33,148,183,207,141,1,3,156,251,113,245,209,103,113,70,219,128,70,6,36,208,127,197,73,251,147,24,3,6,120,38,126,255,216,147,255,140,182,1,141,12,48,208,119,197,89,231,147,40,3,14,240,252,255,123,70,219,128,70,6,48,96,98,96,96,249,199,212,119,197,69,237,139,16,3,6,184,207,251,110,241,215,53,140,182,1,141,12,72,192,245,181,98,233,109,115,6,12,144,157,115,237,238,235,75,140,182,1,141,12,168,64,252,23,151,200,79,46,70,206,255,82,161,191,12,30,139,123,156,145,204,112,123,190,192,248,3,223,171,223,140,182,1,141,12,56,128,68,232,55,55,126,161,132,181,186,76,255,24,124,124,94,236,146,251,206,232,81,94,243,245,38,43,3,54,192,37,255,167,72,93,218,229,164,28,3,24,248,250,188,96,116,47,174,253,118,151,133,1,27,224,16,249,87,162,33,229,114,89,150,129,129,33,211,225,205,66,141,207,140,161,75,203,95,172,230,98,192,6,248,13,126,117,49,104,170,223,23,98,96,96,112,10,120,126,150,239,47,99,242,197,162,187,221,188,127,191,48,49,96,0,3,3,214,182,103,58,255,95,191,122,245,244,92,113,188,212,173,31,106,140,233,15,11,222,30,98,123,185,150,155,1,3,204,17,214,228,185,127,245,235,167,167,143,133,217,38,114,201,242,60,55,99,76,127,88,192,192,192,240,239,59,227,189,126,222,95,47,153,25,192,128,67,244,95,62,167,184,194,233,107,108,191,127,124,99,98,218,245,131,229,209,11,222,151,166,206,0,86,58,137,233,187,170,184,51,0,0,0,0,73,69,78,68,174,66,96,130,18,160,3,10,16,49,55,52,55,57,54,50,54,48,54,95,51,46,112,110,103,18,9,105,109,97,103,101,47,112,110,103,26,128,3,137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,12,0,0,0,13,8,2,0,0,0,18,75,24,21,0,0,1,71,73,68,65,84,24,25,99,156,223,176,115,18,127,137,192,63,17,177,191,50,170,127,244,245,126,89,75,51,138,138,219,52,179,9,221,96,128,1,198,144,174,200,187,172,87,24,144,128,55,167,126,154,249,109,6,36,192,104,216,175,203,128,10,188,197,217,210,52,89,24,144,0,163,97,191,46,3,18,224,249,197,182,136,81,139,217,245,22,3,18,96,76,236,202,184,192,122,148,129,129,129,137,129,193,233,190,74,203,126,215,15,249,251,127,26,63,98,64,2,140,7,107,158,190,100,121,116,129,237,240,93,150,203,142,215,120,18,47,107,190,171,220,249,91,249,13,3,18,96,60,94,243,154,1,12,184,95,63,83,63,118,244,31,223,143,119,173,27,255,242,255,96,64,2,140,187,154,207,241,254,148,101,0,130,127,255,248,95,189,80,188,181,251,109,243,230,127,124,63,24,144,0,227,254,233,59,56,158,26,51,192,0,255,219,199,130,206,245,191,149,95,49,32,1,198,45,251,115,133,247,214,49,192,193,191,127,60,170,27,248,13,230,49,32,1,198,117,151,220,132,247,215,178,189,81,101,248,207,204,0,6,172,194,251,5,244,122,216,132,24,25,96,128,113,221,21,23,166,111,162,66,103,173,88,159,70,48,128,193,191,159,47,56,100,26,69,237,30,51,192,0,227,186,43,46,12,96,32,123,64,249,207,139,22,6,40,248,199,41,117,82,200,178,149,1,12,0,37,146,108,214,123,14,104,105,0,0,0,0,73,69,78,68,174,66,96,130,18,150,3,10,16,49,55,52,55,57,54,50,54,48,54,95,52,46,112,110,103,18,9,105,109,97,103,101,47,112,110,103,26,246,2,137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,12,0,0,0,12,8,2,0,0,0,217,23,203,176,0,0,1,61,73,68,65,84,24,25,117,193,207,43,131,97,0,7,240,239,195,246,62,94,123,183,189,88,111,214,74,36,178,219,226,192,107,14,99,23,90,146,40,133,139,20,229,196,197,77,89,180,218,69,59,200,129,3,39,23,212,156,252,3,164,108,205,205,132,94,246,106,109,77,44,189,251,229,245,182,41,181,122,47,239,231,67,238,118,215,179,182,12,72,45,245,214,43,223,184,23,216,56,116,74,158,162,234,84,73,248,124,36,218,31,3,224,253,117,142,111,251,29,89,27,116,20,86,173,13,149,137,40,81,0,158,79,219,234,230,34,12,16,81,162,107,101,123,64,114,201,123,62,24,32,251,201,182,165,138,181,34,183,188,71,124,48,64,138,247,157,0,180,239,166,215,224,4,12,144,163,7,199,252,15,135,42,180,15,75,250,120,88,205,113,208,97,132,130,107,249,150,136,18,221,40,241,129,95,22,128,18,239,200,158,14,64,71,152,75,216,7,83,68,148,168,9,232,211,76,221,85,166,135,229,172,121,158,62,183,126,93,219,31,49,90,98,204,229,230,134,167,116,23,17,37,138,58,63,47,184,211,188,57,201,40,135,114,12,51,81,4,241,143,136,18,69,157,101,39,36,100,218,167,87,34,133,131,23,0,9,76,157,33,12,128,136,18,69,93,99,104,11,87,147,222,217,75,113,236,66,57,201,169,138,150,135,211,68,185,63,187,168,109,40,158,47,125,227,0,0,0,0,73,69,78,68,174,66,96,130,26,102,10,16,107,100,102,95,49,55,52,55,57,54,50,54,48,54,95,49,18,21,80,114,105,118,95,72,75,68,70,95,95,49,55,52,55,57,54,50,54,48,54,26,16,49,55,52,55,57,54,50,54,48,54,95,51,46,112,110,103,34,16,49,55,52,55,57,54,50,54,48,54,95,52,46,112,110,103,42,23,80,114,105,118,95,70,111,111,66,97,114,95,95,49,55,52,55,57,54,50,54,48,54,26,102,10,16,107,100,102,95,49,55,52,55,57,54,50,54,48,54,95,50,18,21,80,114,105,118,95,72,75,68,70,95,95,49,55,52,55,57,54,50,54,48,54,26,16,49,55,52,55,57,54,50,54,48,54,95,51,46,112,110,103,34,16,49,55,52,55,57,54,50,54,48,54,95,51,46,112,110,103,42,23,80,114,105,118,95,70,111,111,66,97,114,95,95,49,55,52,55,57,54,50,54,48,54]}
  //   try {
  //     const responseObj = JSON.parse(response)
  //     if (
  //       responseObj &&
  //       (responseObj.message_type == 8 || responseObj.message_type == 10)
  //     ) {
  //       console.log(
  //         'onPrivittyAddPeerCB privitty core requesting to complete the handshake for message type =',
  //         responseObj.message_type
  //       )
  //       let subject = ''
  //       if (responseObj.message_type == 8) {
  //         subject = "{'privitty':'true', 'type':'new_peer_add'}"
  //       } else {
  //         subject = "{'privitty':'true', 'type':'new_peer_complete'}"
  //       }
  //       const base64Msg = btoa(String.fromCharCode.apply(null, responseObj.pdu))
  //       const MESSAGE_DEFAULT: T.MessageData = {
  //         file: null,
  //         filename: null,
  //         viewtype: null,
  //         html: null,
  //         location: null,
  //         overrideSenderName: null,
  //         quotedMessageId: null,
  //         quotedText: null,
  //         text: null,
  //       }
  //       const message: Partial<T.MessageData> = {
  //         text: base64Msg,
  //         file: undefined,
  //         filename: undefined,
  //         quotedMessageId: null,
  //         viewtype: 'Text',
  //       }
  //       this.jsonrpcRemote.rpc.sendMsgWithSubject(
  //         (await this.jsonrpcRemote.rpc.getSelectedAccountId()) || 0,
  //         responseObj.chatId,
  //         { ...MESSAGE_DEFAULT, ...message },
  //         subject
  //       )
  //     }
  //   } catch (e) {
  //     console.log('onPrivittyAddPeerCB error', e)
  //   }
  // }

  async sendMessageToPeer(pdu: string, chatId: number) {
    console.log('sendMessageToPeer  ⚠️⚠️⚠️')

    console.log('PDU⚠️⛔️⛔️⚠️', pdu)

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
    } catch (e) {
      console.log('sendMessageToPeer error', e)
    }
  }

  async privittyHandleServerResponse(Response: string) {
    try {
      const jsonresp = JSON.parse(Response)
      const statusCode = jsonresp.message_type || 0
      const chatId = jsonresp.chatId || 0
      const pdu = jsonresp.pdu || []
      const forwardToChatId = jsonresp.forwardToChatId || 0

      if (statusCode == PRV_APP_STATUS_VAULT_IS_READY) {
        console.log('JAVA-Privitty', 'Congratulations! Vault is created\n')
      } else if (statusCode == PRV_APP_STATUS_SEND_PEER_PDU) {
        console.log(
          'JAVA-Privitty',
          'Send add new peer request to chatId:' + chatId
        )
        this.sendMessageToPeer(pdu, chatId)
      } else if (statusCode == PRV_APP_STATUS_FORWARD_PDU) {
        console.log(
          'JAVA-Privitty',
          'Forward pdu to forwardToChatId:' + forwardToChatId
        )
        this.sendMessageToPeer(pdu, forwardToChatId)
      } else if (statusCode == PRV_APP_STATUS_PEER_ADD_COMPLETE) {
        console.log(
          'JAVA-Privitty',
          'Congratulations! Add new peer handshake is complete with chatID:' +
            chatId
        )
        this.sendMessageToPeer(pdu, chatId)
      } else if (statusCode == PRV_APP_STATUS_PEER_ADD_CONCLUDED) {
        console.log('JAVA-Privitty', 'Congratulations! New peer concluded.')
        this.sendMessageToPeer(pdu, chatId)
      } else if (statusCode == PRV_APP_STATUS_PEER_OTSP_SPLITKEYS) {
        console.log('JAVA-Privitty', 'Peer OTSP sent')
        this.sendMessageToPeer(pdu, chatId)
        // int fromId = msg.getFromId();
        // String msgText = "OTSP_SENT";
        // String msgType = "system";
        // String mediaPath = "";
        // String filename = "";
        // int fileSessionTimeout = 0;
        // int canDownload = 0;
        // int canForward = 0;
        // int numPeerSssRequest = 0;
        // String forwardedTo = "";
        // int sentPrivittyProtected = 0;

        // privJni.addMessage(msgId, chatId, fromId, msgText, msgType, mediaPath, filename,
        //   fileSessionTimeout, canDownload, canForward,
        //   numPeerSssRequest, forwardedTo, sentPrivittyProtected);
      } else if (statusCode == PRV_APP_STATUS_PEER_SPLITKEYS_REQUEST) {
        console.log('JAVA-Privitty', 'Peer SPLITKEYS request')
        this.sendMessageToPeer(pdu, chatId)
      } else if (statusCode == PRV_APP_STATUS_PEER_SPLITKEYS_RESPONSE) {
        console.log('JAVA-Privitty', 'Peer SPLITKEYS response')
        this.sendMessageToPeer(pdu, chatId)
      } else if (statusCode == PRV_APP_STATUS_PEER_SPLITKEYS_REVOKED) {
        console.log('JAVA-Privitty', 'Peer SPLITKEYS revoked')
        // new Handler(Looper.getMainLooper()).post(() -> {
        //   Toast.makeText(getApplicationContext(), "You undo revoke", Toast.LENGTH_SHORT).show();
        // });
        this.sendMessageToPeer(pdu, chatId)
      } else if (statusCode == PRV_APP_STATUS_PEER_SPLITKEYS_UNDO_REVOKED) {
        console.log('JAVA-Privitty', 'Peer SPLITKEYS undo revoked')
        // new Handler(Looper.getMainLooper()).post(() -> {
        //   Toast.makeText(getApplicationContext(), "You revoked access", Toast.LENGTH_SHORT).show();
        // });
        this.sendMessageToPeer(pdu, chatId)
      } else if (statusCode == PRV_APP_STATUS_FORWARD_SPLITKEYS_REVOKED) {
        console.log('JAVA-Privitty', 'Peer SPLITKEYS undo revoked')
        // new Handler(Looper.getMainLooper()).post(() -> {
        //   Toast.makeText(getApplicationContext(), "You revoked access", Toast.LENGTH_SHORT).show();
        // });
        this.sendMessageToPeer(pdu, forwardToChatId)
      } else if (statusCode == PRV_APP_STATUS_PEER_SPLITKEYS_DELETED) {
        console.log('JAVA-Privitty', 'Peer SPLITKEYS deleted')
        this.sendMessageToPeer(pdu, chatId)
      } else if (statusCode == PRV_APP_STATUS_GROUP_ADD_ACCEPTED) {
        console.log(
          'JAVA-Privitty',
          'Congratulations! New chat group is ready.'
        )
        this.sendMessageToPeer(pdu, chatId)
      } else if (
        statusCode == PRV_APP_STATUS_FORWARD_SPLITKEYS_REQUEST ||
        statusCode == PRV_APP_STATUS_REVERT_FORWARD_SPLITKEYS_REQUEST
      ) {
        console.log(
          'JAVA-Privitty',
          'Forward/Revert Request: ' +
            statusCode +
            ' ChatId: ' +
            chatId +
            ' ForwardToChatId: ' +
            forwardToChatId
        )
        this.sendMessageToPeer(pdu, chatId)
      } else if (statusCode == PRV_APP_STATUS_RELAY_FORWARD_SPLITKEYS_REQUEST) {
        console.log(
          'JAVA-Privitty',
          'Relay request: ' +
            statusCode +
            ' ChatId: ' +
            chatId +
            ' ForwardToChatId: ' +
            forwardToChatId
        )
        this.sendMessageToPeer(pdu, forwardToChatId)
      } else if (
        statusCode == PRV_APP_STATUS_RELAY_BACKWARD_SPLITKEYS_RESPONSE
      ) {
        console.log(
          'JAVA-Privitty',
          'Relay response: ' +
            statusCode +
            ' ChatId: ' +
            chatId +
            ' ForwardToChatId: ' +
            forwardToChatId
        )
        this.sendMessageToPeer(pdu, forwardToChatId)
      } else {
        console.error('JAVA-Privitty', 'StatusCode: ' + statusCode)
      }
    } catch (e) {
      console.error('privittyHandleServerResponse error', e)
    }
  }

  async privittyHandleIncomingMsg(response: string) {
    let sequenceNumber = this.getGlobalSequence()

    console.log('Hello privittyHandleIn comingMsg')

    console.log('privittyHandleIn comingMsg', response)
    const responseObj = JSON.parse(response)
    //{"jsonrpc":"2.0","id":302,"result":{"contextId":8,"event":{"chatId":13,"kind":"IncomingMsg","msgId":40}}}
    // {"jsonrpc":"2.0","id":494,"result":{"contextId":5,"event":{"chatId":104,"kind":"IncomingMsg","msgId":2014}}}
    const Msg = await this.jsonrpcRemote.rpc.getMessage(
      responseObj.result.contextId,
      responseObj.result.event.msgId
    )
    const chatInfo = await this.jsonrpcRemote.rpc.getBasicChatInfo(
      responseObj.result.contextId,
      responseObj.result.event.chatId
    )
    // let isPrivittyMessage = true;
    // const isPrivittyMessage = await this.privitty_account_manager.sendJsonRpcRequest(
    //   'isPrivittyMessage',
    //   sequenceNumber,
    //   {
    //     base64_data: Msg.text
    //   }
    // )

    console.log('--- DBG: entering privittyHandleIncomingMsg check ---')
    console.log('DBG: Msg is', typeof Msg, Msg)
    console.log('DBG: chatInfo is', typeof chatInfo, chatInfo)

    if (Msg.showPadlock && !chatInfo.isContactRequest) {
      console.log(
        'Msg.showPadlock && !chatInfo.isContactRequest⛔️⛔️⛔️⛔️⛔️⛔️⛔️⛔️⛔️⛔️⛔️⛔️⛔️⛔️⛔️'
      )

      this.callbackMap.set(sequenceNumber, (response: string) => {
        this.handlePrivittyValidation(
          response,
          Msg,
          responseObj.result.event.chatId,
          responseObj.result.contextId
        )
      })


      if (!Msg.text || Msg.text.trim() === '') {
        console.log(
          '⛔️ Privitty check skipped — empty Msg.text (likely file or system message)',
          Msg
        )
        return
      }

      console.log('✅ base64_data:', Msg.text)

      this.privitty_account_manager.sendJsonRpcRequest(
        'isPrivittyMessage',
        { base64_data: Msg.text },
        sequenceNumber,
      )

      // if (isPrivittyMessage) {
      //   console.log('privittyHandleIncomingMsg subject =', subject)
      //   if (subject.indexOf('new_peer_conclude') !== -1) {
      //     this.jsonrpcRemote.rpc.deleteMessages(responseObj.result.contextId, [
      //       responseObj.result.event.msgId,
      //     ])
      //   } else if (subject.indexOf('new_group_concluded') !== -1) {
      //     this.jsonrpcRemote.rpc.deleteMessages(responseObj.result.contextId, [
      //       responseObj.result.event.msgId,
      //     ])
      //   } else if (subject.indexOf('privfile') !== -1) {
      //     console.log('privittyHandleIncomingMsg privfile')
      //     return
      //   } else {
      //     // Dec  de Base64 to binary string
      //     const binaryString = atob(Msg.text)

      //     // Create byte array
      //     const byteArray = new Uint8Array(binaryString.length)

      //     for (let i = 0; i < binaryString.length; i++) {
      //       byteArray[i] = binaryString.charCodeAt(i)
      //     }
      //     //const arrayString = `[${byteArray.join(',')}]`;
      //     this.callbackMap.set(sequenceNumber, response =>
      //       this.privittyHandleServerResponse(response as string)
      //     )
      // this.privitty_account_manager.sendJsonRpcRequest(
      //   'sendEvent',
      //   sequenceNumber,
      //   {
      //     event_type: "peerAddResponse",
      //     event_data: {
      //       chat_id: String(responseObj.result.event.chatId),
      //       peer_id: String(Msg.fromId),
      //       accepted: true
      //     }
      //   }
      // )
      //     // this.jsonrpcRemote.rpc.deleteMessages(responseObj.result.contextId, [
      //     //   responseObj.result.event.msgId,
      //     // ])
      //   }
      // }
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
    console.log('handlePrivittyValidation ⛔️', parsed)

    if (!parsed?.result?.is_valid) return

    this.callbackMap.set(sequenceNumber, (resp: string) => {
      try {
        const json = JSON.parse(resp)

        const pdu = json?.result?.data?.pdu
        const targetChatId = Number(json?.result?.data?.chat_id)

        if (!pdu || !targetChatId) {
          console.error('Invalid processMessage response', json)
          return
        }

        console.log('✅ Sending PDU to chat:', targetChatId)
        this.sendMessageToPeer(pdu, targetChatId)
      } catch (err) {
        console.error('Failed to handle processMessage response', err)
      }
    })

    console.log('sequenceNumber ======== #️⃣#️⃣#️⃣#️⃣#️⃣',sequenceNumber);

    console.log('Message Data 📥📥📥📥', msg);
    
    
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
          } else {
            console.warn('Unhandled response:', response)
            if (resp.id === 0) {
              console.warn('PrivittyController: id is 0 ⛔️⛔️')
              this.privittyHandleServerResponse(response)
            }
          }
        } catch (error) {
          console.error('Failed to parse response: ⛔️⛔️', error)
        }
        //logCoreEvent.debug('Privitty Controller response', response)
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
