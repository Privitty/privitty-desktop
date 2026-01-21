import React from 'react'
import classNames from 'classnames'
import { filesize } from 'filesize'

import {
  confirmDialog,
  openAttachmentInShell,
  openSecureViewer,
} from '../message/messageFunctions'
import {
  isDisplayableByFullscreenMedia,
  isImage,
  isVideo,
  isAudio,
  getExtension,
  dragAttachmentOut,
  MessageTypeAttachmentSubset,
} from './Attachment'
import { runtime } from '@deltachat-desktop/runtime-interface'
import { getDirection } from '../../utils/getDirection'
import { BackendRemote, Type } from '../../backend-com'
import FullscreenMedia, {
  NeighboringMediaMode,
} from '../dialogs/FullscreenMedia'
import useTranslationFunction from '../../hooks/useTranslationFunction'
import useDialog from '../../hooks/dialog/useDialog'
import AudioPlayer from '../AudioPlayer'
import { T, C } from '@deltachat/jsonrpc-client'
import { selectedAccountId } from '../../ScreenController'
import { dirname, extname } from 'path'
import { file } from 'jszip'

type AttachmentProps = {
  text?: string
  message: Type.Message
  tabindexForInteractiveContents: -1 | 0
}

export default function Attachment({
  text,
  message,
  tabindexForInteractiveContents,
}: AttachmentProps) {
  const tx = useTranslationFunction()
  const { openDialog } = useDialog()
  if (!message.file) {
    return null
  }
  const direction = getDirection(message)
  const onClickAttachment = async (ev: any) => {
    console.log('onClickAttachment ⛔️📍')
    console.log('onClickAttachment ⛔️📍', message)

    if (message.viewType === 'Sticker') return
    ev.stopPropagation()
    if (isDisplayableByFullscreenMedia(message.fileMime)) {
      openDialog(FullscreenMedia, {
        msg: message,
        neighboringMedia: NeighboringMediaMode.Chat,
      })
    } else {
      // Check if this is a supported media file (including .prv files that decrypt to supported formats)
      const supportedExtensions = [
        '.pdf',
        '.jpg',
        '.jpeg',
        '.png',
        '.gif',
        '.bmp',
        '.webp',
        '.svg',
        '.mp4',
        '.avi',
        '.mov',
        '.wmv',
        '.flv',
        '.webm',
        '.mkv',
        '.m4v',
      ]
      const isSupportedMedia =
        message.fileName?.toLowerCase().endsWith('.prv') ||
        supportedExtensions.some(ext =>
          message.fileName?.toLowerCase().endsWith(ext)
        )

      if (isSupportedMedia) {
        // Check if this is a supported media file that should be opened in secure viewer
        console.log(
          'onClickAttachment ⛔️📍 Check if this is a supported media file that should be opened in secure viewer'
        )
        const fileName = message.fileName?.toLowerCase() || ''

        const cleanedFileName = fileName.endsWith('.prv')
          ? fileName.slice(0, -4)
          : fileName

        const fileExtension = cleanedFileName.split('.').pop() || ''

        console.log('fileExtension:', fileExtension)

        const supportedImageExtensions = [
          'jpg',
          'jpeg',
          'png',
          'gif',
          'bmp',
          'webp',
          'svg',
        ]
        const supportedVideoExtensions = [
          'mp4',
          'avi',
          'mov',
          'wmv',
          'flv',
          'webm',
          'mkv',
          'm4v',
        ]

        if (
          fileExtension === 'pdf' ||
          supportedImageExtensions.includes(fileExtension) ||
          supportedVideoExtensions.includes(fileExtension)
        ) {
          try {
            // For supported media files, we need to get the file path and open in secure viewer
            let tmpFile: string
            try {
              console.log('copyFileToInternalTmpDir')

              tmpFile = await runtime.copyFileToInternalTmpDir(
                message.fileName || '',
                message.file || ''
              )
            } catch (copyError) {
              console.log('Media File Error ⛔️⛔️⛔️⛔️⛔️⛔️⛔️')

              const errorMessage =
                copyError instanceof Error ? copyError.message : 'Unknown error'

              // Show user-friendly error message
              runtime.showNotification({
                title: 'Media File Error',
                body: 'The media file could not be opened because it is no longer available. It may have been deleted or moved.',
                icon: null,
                chatId: message.chatId,
                messageId: message.id,
                accountId: selectedAccountId(),
                notificationType: 0,
              })

              // Fall back to regular opening
              openAttachmentInShell(message)
              return
            }

            let filePathName = tmpFile
            filePathName = tmpFile.replace(/\\/g, '/')

            // Handle .prv files (encrypted files)
            console.log(
              'onClickAttachment ⛔️📍 Handle .prv files (encrypted files)'
            )
            console.log('MESSAGE ==== 📥📥📥📥📥📥', message)

            const isForwarded =
              Boolean(message.isForwarded) && message.viewType === 'File'

            if (isForwarded) {
              const response = await runtime.PrivittySendMessage('sendEvent', {
                event_type: 'getFileAccessStatus',
                event_data: {
                  chat_id: String(message.chatId),
                  file_path: message.file,
                },
              })
              const fileAccessStatus = JSON.parse(response).result?.data?.status
              console.log('fileAccessStatus', fileAccessStatus)
              if (fileAccessStatus == 'expired') {
                const yes = await confirmDialog(
                  openDialog,
                  'This file is no longer accessible. You can request access from the owner to view it again.',
                  'SEND REQUEST'
                )
                if (yes) {
                  console.log(
                    '🔐 Forwarded file detected, requesting access...'
                  )
                  const forwardAccessResp = await runtime.PrivittySendMessage(
                    'sendEvent',
                    {
                      event_type: 'initForwardAccessRequest',
                      event_data: {
                        chat_id: String(message.chatId),
                        file_path: message.file,
                      },
                    }
                  )
                  const parsed = JSON.parse(forwardAccessResp)
                  const pdu: string | undefined = parsed?.result?.data?.pdu

                  if (!pdu) {
                    throw new Error(
                      'PDU not returned from initAccessRevokeRequest'
                    )
                  }
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
                  const messageR: Partial<T.MessageData> = {
                    text: pdu,
                    file: undefined,
                    filename: undefined,
                    quotedMessageId: null,
                    viewtype: 'Text',
                  }

                  const msgId = await BackendRemote.rpc.sendMsg(
                    selectedAccountId(),
                    message.chatId,
                    {
                      ...MESSAGE_DEFAULT,
                      ...messageR,
                    }
                  )
                  console.log('Access revoke message sent, msgId:', msgId)
                }
                return
              }
              if (fileAccessStatus == 'active'){
                const response = await runtime.PrivittySendMessage(
                    'sendEvent',
                    {
                      event_type: 'forwardedFileDecryptRequest',
                      event_data: {
                        chat_id: String(message.chatId),
                        prv_file: filePathName,
                      },
                    }
                  )
                  const newResponse = JSON.parse(response)
                  console.log(
                    'response from messageAttachment ⚠️⚠️⚠️⚠️⚠️',
                    String(newResponse)
                  )
                  filePathName = String(newResponse.result?.data?.file_path)
              }
            } else if (message.fileName?.toLowerCase().endsWith('.prv')) {
              console.log('filePathName from messageAttachment')
              console.log(
                'filePathName from messageAttachment',
                dirname(filePathName)
              )
              const response = await runtime.PrivittySendMessage('sendEvent', {
                event_type: 'fileDecryptRequest',
                event_data: {
                  chat_id: String(message.chatId),
                  prv_file: filePathName,
                },
                // chatId: message.chatId,
                // filePath: dirname(filePathName),
                // fileName: message.fileName,
                // direction: message.fromId === C.DC_CONTACT_ID_SELF ? 1 : 0,
              })

              console.log('response from messageAttachment', response)
              const newResponse = JSON.parse(response)
              console.log(
                'response from messageAttachment',
                String(newResponse.result?.data?.file_path)
              )
              filePathName = String(newResponse.result?.data?.file_path)

              // if (filePathName === 'SPLITKEYS_EXPIRED' || filePathName === 'SPLITKEYS_REQUESTED') {
              //   // Fall back to regular opening
              //   openAttachmentInShell(message)
              //   return
              // }
            }

            // Determine the correct viewer type based on file extension
            let viewerType: 'pdf' | 'image' | 'video' = 'pdf'
            const finalFileExtension = extname(filePathName).toLowerCase()

            console.log('Determining viewer type')
            console.log('Determining viewer type', {
              filePathName,
              finalFileExtension,
              fileName: message.fileName,
            })

            if (finalFileExtension === '.pdf') {
              viewerType = 'pdf'
            } else if (
              [
                '.jpg',
                '.jpeg',
                '.png',
                '.gif',
                '.bmp',
                '.webp',
                '.svg',
              ].includes(finalFileExtension)
            ) {
              viewerType = 'image'
            } else if (
              [
                '.mp4',
                '.avi',
                '.mov',
                '.wmv',
                '.flv',
                '.webm',
                '.mkv',
                '.m4v',
              ].includes(finalFileExtension)
            ) {
              viewerType = 'video'
            }

            console.log('Opening secure viewer', {
              viewerType,
              filePathName,
              fileName: message.fileName,
            })

            // Open in appropriate secure viewer
            openSecureViewer(
              openDialog,
              filePathName,
              message.fileName || '',
              viewerType
            )
          } catch (error) {
            console.error('Error opening media in secure viewer:', error)
            // Fallback to regular opening
            openAttachmentInShell(message)
          }
        } else {
          // For non-PDF files, use the regular opening method
          const result = await openAttachmentInShell(message)
          if (result?.useSecureViewer) {
            openSecureViewer(
              openDialog,
              result.filePath!,
              result.fileName!,
              result.viewerType as 'pdf' | 'image' | 'video'
            )
          }
        }
      } else {
        const result = await openAttachmentInShell(message)
        if (result?.useSecureViewer) {
          openSecureViewer(
            openDialog,
            result.filePath!,
            result.fileName!,
            result.viewerType as 'pdf' | 'image' | 'video'
          )
        }
      }
    }
  }

  /**
   * height has to be calculated before images are loaded to enable
   * the virtual list to calculate the correct height of all messages
   *
   * if the image exceeds the maximal width or height it will be scaled down
   * if the image exceeds the minimal width or height it will be scaled up
   *
   * if after resizing one dimension exceeds a maximum it will be cropped
   * by css rules: max-width/max-height with object-fit: cover
   */
  const calculateHeight = (
    message: Pick<
      T.Message,
      'dimensionsHeight' | 'dimensionsWidth' | 'viewType'
    >
  ): number => {
    const minWidth = 200 // needed for readable footer & reactions
    const minHeight = 50 // needed for readable footer
    const maxLandscapeWidth = 450 // also set by css
    const maxPortraitHeight = 450 // also set by css
    const stickerHeight = 200

    if (message.viewType === 'Sticker') {
      return stickerHeight
    }

    const height = message.dimensionsHeight
    const width = message.dimensionsWidth
    const portrait = isPortrait(message)
    let finalHeight: number
    if (portrait) {
      // limit height if needed
      finalHeight = Math.min(height, maxPortraitHeight)
      if (height < maxPortraitHeight) {
        if ((finalHeight / height) * width < minWidth) {
          // stretch image to have minWidth
          finalHeight = (height / width) * minWidth
        }
      }
    } else {
      // make sure image is not wider than maxWidth
      finalHeight = Math.min(height, (maxLandscapeWidth / width) * height)
      if ((finalHeight / height) * width < minWidth) {
        // stretch image to have minWidth
        finalHeight = (height / width) * minWidth
      }
      if (finalHeight < minHeight) {
        finalHeight = minHeight
      }
    }
    return finalHeight
  }

  const isPortrait = (
    message: Pick<T.Message, 'dimensionsHeight' | 'dimensionsWidth'>
  ): boolean => {
    if (message.dimensionsHeight === 0 || message.dimensionsWidth === 0) {
      return false
    }
    return message.dimensionsHeight > message.dimensionsWidth
  }

  const withCaption = Boolean(text)
  // For attachments which aren't full-frame
  const withContentBelow = withCaption
  if (isImage(message.fileMime) || message.viewType === 'Sticker') {
    if (!message.file) {
      return (
        <div
          className={classNames('message-attachment-broken-media', direction)}
        >
          {tx('attachment_failed_to_load')}
        </div>
      )
    }
    return (
      <button
        onClick={onClickAttachment}
        tabIndex={tabindexForInteractiveContents}
        className={classNames(
          'message-attachment-media',
          withCaption ? 'content-below' : null
        )}
      >
        <img
          className={classNames(
            'attachment-content',
            isPortrait(message) ? 'portrait' : null,
            message.viewType === 'Sticker' ? 'sticker' : null
          )}
          src={runtime.transformBlobURL(message.file)}
          height={calculateHeight(message)}
        />
      </button>
    )
  } else if (isVideo(message.fileMime)) {
    if (!message.file) {
      return (
        <button
          onClick={onClickAttachment}
          tabIndex={tabindexForInteractiveContents}
          style={{ cursor: 'pointer' }}
          className={classNames('message-attachment-broken-media', direction)}
        >
          {tx('attachment_failed_to_load')}
        </button>
      )
    }
    // the native fullscreen option is better right now so we don't need to open our own one
    return (
      <div
        className={classNames(
          'message-attachment-media',
          withCaption ? 'content-below' : null
        )}
      >
        <video
          className='attachment-content video-content'
          src={runtime.transformBlobURL(message.file)}
          controls={true}
          // Despite the element having multiple interactive
          // (pseudo?) elements inside of it, tabindex applies to all of them.
          tabIndex={tabindexForInteractiveContents}
        />
      </div>
    )
  } else if (isAudio(message.fileMime)) {
    return (
      <div
        className={classNames(
          'message-attachment-audio',
          withContentBelow ? 'content-below' : null
        )}
      >
        <AudioPlayer
          src={runtime.transformBlobURL(message.file)}
          // Despite the element having multiple interactive
          // (pseudo?) elements inside of it, tabindex applies to all of them.
          tabIndex={tabindexForInteractiveContents}
        />
      </div>
    )
  } else {
    const { fileName, fileBytes, fileMime }: MessageTypeAttachmentSubset =
      message

    const extension = getExtension(message)
    return (
      <button
        className={classNames(
          'message-attachment-generic',
          withContentBelow ? 'content-below' : null
        )}
        onClick={onClickAttachment}
        tabIndex={tabindexForInteractiveContents}
      >
        <div
          className='file-icon'
          draggable='true'
          onDragStart={dragAttachmentOut.bind(null, message.file)}
          title={fileMime || 'null'}
        >
          {extension ? (
            <div className='file-extension'>
              {fileMime === 'application/octet-stream' ? '' : extension}
            </div>
          ) : null}
        </div>
        <div className='text-part'>
          <div className='name'>{fileName}</div>
          <div className='size'>{fileBytes ? filesize(fileBytes) : '?'}</div>
        </div>
      </button>
    )
  }
}

export function DraftAttachment({
  attachment,
}: {
  attachment: MessageTypeAttachmentSubset
}) {
  if (!attachment) {
    return null
  }
  if (isImage(attachment.fileMime)) {
    return (
      <div className={classNames('message-attachment-media')}>
        <img
          className='attachment-content'
          src={runtime.transformBlobURL(attachment.file || '')}
        />
      </div>
    )
  } else if (isVideo(attachment.fileMime)) {
    return (
      <div className={classNames('message-attachment-media')}>
        <video
          className='attachment-content'
          src={runtime.transformBlobURL(attachment.file || '')}
          controls
        />
      </div>
    )
  } else if (isAudio(attachment.fileMime)) {
    return <AudioPlayer src={runtime.transformBlobURL(attachment.file || '')} />
  } else if (attachment.webxdcInfo) {
    const iconUrl = runtime.getWebxdcIconURL(selectedAccountId(), attachment.id)
    return (
      <div className='media-attachment-webxdc'>
        <img className='icon' src={iconUrl} alt='app icon' />
        <div className='text-part'>
          <div className='name'>{attachment.webxdcInfo.name}</div>
          <div className='size'>
            {attachment.fileBytes ? filesize(attachment.fileBytes) : '?'}
          </div>
        </div>
      </div>
    )
  } else {
    const { file, fileName, fileBytes, fileMime } = attachment
    const extension = getExtension(attachment)

    return (
      <div className={classNames('message-attachment-generic')}>
        <div
          className='file-icon'
          draggable='true'
          onDragStart={ev => file && dragAttachmentOut(file, ev)}
          title={fileMime || 'null'}
        >
          {extension ? (
            <div className='file-extension'>
              {fileMime === 'application/octet-stream' ? '' : extension}
            </div>
          ) : null}
        </div>
        <div className='text-part'>
          <div className='name'>{fileName}</div>
          <div className='size'>{fileBytes ? filesize(fileBytes) : '?'}</div>
        </div>
      </div>
    )
  }
}
