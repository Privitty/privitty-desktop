//import { useCallback } from 'react'
import React, { useCallback, useContext } from 'react'
import useChat from './useChat'
import { BackendRemote } from '../../backend-com'
import { ChatView } from '../../contexts/ChatContext'
import { getLogger } from '../../../../shared/logger'

import type { T } from '@deltachat/jsonrpc-client'
import { partial } from 'filesize'
//import useDialog from '../../hooks/dialog/useDialog'
//import SmallSelectDialogPrivitty from '../../components/SmallSelectDialogPrivitty'
import { runtime } from '@deltachat-desktop/runtime-interface'
import { dirname, basename, normalize } from 'path'
//import { ContextMenuContext } from '../../contexts/ContextMenuContext'
import { useSharedDataOptional } from '../../contexts/FileAttribContext'
import { PRV_APP_STATUS_PEER_OTSP_SPLITKEYS } from '../../../../target-electron/src/privitty/privitty_type'

export type JumpToMessage = (params: {
  // "not from a different account" because apparently
  // `selectAccount` throws if `nextAccountId` is not the same
  // as the current account ID.
  //
  // TODO refactor: can't we just remove this property then?
  /**
   * The ID of the currently selected account.
   * jumpToMessage from `useMessage()` _cannot_ jump to messages
   * of different accounts.
   */
  accountId: number
  msgId: number
  /**
   * Optional, but if it is known, it's best to provide it
   * for better performance.
   * When provided, the caller guarantees that
   * `msgChatId === await rpc.getMessage(accountId, msgId)).chatId`.
   */
  msgChatId?: number
  highlight?: boolean
  focus: boolean
  /**
   * The ID of the message to remember,
   * to later go back to it, using the "jump down" button.
   *
   * This has no effect if `msgId` and `msgParentId` belong to different chats.
   * Because otherwise if the user pops the stack
   * by clicking the "jump down" button,
   * we'll erroneously show messages from the previous chat
   * without actually switching to that chat.
   */
  msgParentId?: number
  /**
   * `behavior: 'smooth'` should not be used due to "scroll locking":
   * they don't behave well together currently.
   * `inline` also isn't supposed to have effect because
   * the messages list should not be horizontally scrollable.
   */
  scrollIntoViewArg?: Parameters<HTMLElement['scrollIntoView']>[0]
}) => Promise<void>

export type SendMessage = (
  accountId: number,
  chatId: number,
  message: Partial<T.MessageData>
) => Promise<void>

export type ForwardMessage = (
  accountId: number,
  messageId: number,
  chatId: number
) => Promise<void>

export type DeleteMessage = (
  accountId: number,
  messageId: number
) => Promise<void>

const log = getLogger('hooks/useMessage')

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

export default function useMessage() {
  const { chatId, setChatView, selectChat } = useChat()
  const { sharedData, setSharedData } = useSharedDataOptional()

  const jumpToMessage = useCallback<JumpToMessage>(
    async ({
      accountId,
      msgId,
      msgChatId,
      highlight = true,
      focus,
      msgParentId,
      scrollIntoViewArg,
    }) => {
      log.debug(`jumpToMessage with messageId: ${msgId}`)

      if (msgChatId == undefined) {
        msgChatId = (await BackendRemote.rpc.getMessage(accountId, msgId))
          .chatId
      }
      // Check if target message is in same chat, if not switch first
      if (msgChatId !== chatId) {
        await selectChat(accountId, msgChatId)

        // See `msgParentId` docstring.
        msgParentId = undefined
      }
      setChatView(ChatView.MessageList)

      // Workaround to actual jump to message in regarding mounted component view
      window.__internal_jump_to_message_asap = {
        accountId,
        chatId: msgChatId,
        jumpToMessageArgs: [
          {
            msgId,
            highlight,
            focus,
            addMessageIdToStack: msgParentId,
            scrollIntoViewArg,
          },
        ],
      }
      window.__internal_check_jump_to_message?.()
      window.__closeAllDialogs?.()
    },
    [chatId, selectChat, setChatView]
  )

  const sendMessage = useCallback<SendMessage>(
    async (
      accountId: number,
      chatId: number,
      message: Partial<T.MessageData>
    ) => {
      console.log('filePathName:', message)
      let msgId = 0
      if (message.file && message.filename) {
        msgId = await BackendRemote.rpc.sendMsg(
          accountId,
          chatId,
          {
            ...MESSAGE_DEFAULT,
            ...message,
          }
        )

        // Set file attributes (if available) for the just-sent file
        // try {
        //   if (sharedData?.FileDirectory) {
        //     await runtime.PrivittySendMessage('setFileAttributes', {
        //       chatId: chatId,
        //       prvFilename: sharedData.FileDirectory,
        //       outgoing: 1,
        //       allowDownload: sharedData.allowDownload ? 1 : 0,
        //       allowForward: sharedData.allowForward ? 1 : 0,
        //       accessTime: sharedData.allowedTime ? Number(sharedData.allowedTime) : 0,
        //     })
        //   }
        // } catch (error) {
        //   console.error('Failed to set file attributes:', error)
        // }

        // Now that the message has been sent successfully, we can safely delete the encrypted file
        // if (message.file && sharedData?.FileDirectory) {
        //   try {
        //     await runtime.PrivittySendMessage('deleteFile', {
        //       filePath: dirname(sharedData.FileDirectory),
        //       fileName: basename(sharedData.FileDirectory),
        //     })
        //     console.log('Encrypted file deleted after successful sending:', sharedData.FileDirectory)
        //   } catch (error) {
        //     console.error('Failed to delete encrypted file after sending:', error)
        //   }
        // }


        console.log('shared Data', sharedData);

        
        // const response = await runtime.PrivittySendMessage('freshOtsp', {
        //   chatId: chatId,
        //   filePath: sharedData?.FileDirectory,
        // })
        if (sharedData.oneTimeKey) {
          console.log('need to send otsp message:');
          log.info('need to send otsp message:')
        
          const pdu = sharedData.oneTimeKey
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
          BackendRemote.rpc.sendMsg(
            accountId,
            chatId,
            { ...MESSAGE_DEFAULT, ...message }
          )
        }
      } else {
        msgId = await BackendRemote.rpc.sendMsg(accountId, chatId, {
          ...MESSAGE_DEFAULT,
          ...message,
        })
      }

      // Jump down on sending
      jumpToMessage({
        accountId,
        msgId,
        msgChatId: chatId,
        highlight: false,
        focus: false,
      })

      // Reset shared file attributes after send to avoid leaking to next message
      setSharedData({
        allowDownload: false,
        allowForward: false,
        allowedTime: '',
        FileDirectory: '',
        oneTimeKey: '',
      })
    },
    [jumpToMessage, sharedData, setSharedData]
  )

  const forwardMessage = useCallback<ForwardMessage>(
    async (accountId: number, messageId: number, chatId: number) => {
      await BackendRemote.rpc.forwardMessages(accountId, [messageId], chatId)
    },
    []
  )

  const deleteMessage = useCallback<DeleteMessage>(
    async (accountId: number, messageId: number) => {
      await BackendRemote.rpc.deleteMessages(accountId, [messageId])
    },
    []
  )

  return {
    /**
     * Makes the currently rendered MessageList component instance
     * load and scroll the message with the specified `msgId` into view.
     *
     * The specified message may be a message from a different chat,
     * but _not_ from a different account,
     * see {@link JumpToMessage['accountId']}.
     */
    jumpToMessage,
    sendMessage,
    forwardMessage,
    deleteMessage,
  }
}
