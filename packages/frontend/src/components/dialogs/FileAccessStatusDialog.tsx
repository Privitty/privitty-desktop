import React, { useEffect, useState } from 'react'
import { runtime } from '@deltachat-desktop/runtime-interface'
import { DialogBody, DialogContent, DialogWithHeader } from '../Dialog'
import useTranslationFunction from '../../hooks/useTranslationFunction'
import { avatarInitial } from '../Avatar'
import { basename } from 'path'
import type { DialogProps } from '../../contexts/DialogContext'
import Icon from '../Icon'
import useDialog from '../../hooks/dialog/useDialog'
import { selectedAccountId } from '../../ScreenController'
import { BackendRemote } from '../../backend-com'
import { T } from '@deltachat/jsonrpc-client'
import { Contact } from '@deltachat/jsonrpc-client/dist/generated/types'

interface FileAccessUser {
  email: string
  name?: string
  role: 'Owner' | 'Relay' | 'Forwardee'
  status: string
  expiry?: string | number | null
  timestamp?: string | number | null
  permissions?: string[]
}

interface FileAccessStatusDialogProps extends DialogProps {
  chatId: number
  filePath: string
  fileName?: string
}

export default function FileAccessStatusDialog({
  chatId,
  filePath,
  fileName,
  onClose,
}: FileAccessStatusDialogProps) {
  const tx = useTranslationFunction()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sharedUsers, setSharedUsers] = useState<FileAccessUser[]>([])
  const [forwardedUsers, setForwardedUsers] = useState<FileAccessUser[]>([])
  const [displayFileName, setDisplayFileName] = useState<string>('')
  const { openDialog, closeDialog, closeAllDialogs } = useDialog()
  const [isOwner, setIsOwner] = useState<boolean>(false)
  const accountId = selectedAccountId()

  const isAccessRequested = (status?: string) => {
    if (!status) return false
    return ['requested', 'relay_to_owner', 'waiting_owner_action'].includes(
      status.toLowerCase()
    )
  }

  const fetchFileAccessStatus = async () => {
    try {
      setLoading(true)
      setError(null)

      console.log('filePath ==== 📂📂📂📂📂', filePath)

      const response = await runtime.PrivittySendMessage('sendEvent', {
        event_type: 'getFileAccessStatusList',
        event_data: {
          chat_id: String(chatId),
          file_path: filePath,
        },
      })

      const parsed = typeof response === 'string' ? JSON.parse(response) : response
      let result = parsed?.result

      // Handle double-encoded result (result may be a JSON string)
      if (typeof result === 'string') {
        try {
          result = JSON.parse(result)
        } catch {
          // fallback to original
        }
      }

      const data = result?.data
      const fileData = data?.file

      if (!data) {
        throw new Error('Invalid response from getFileAccessStatusList')
      }

      // Process Shared (Relay) users - shared_info is a single object
      const shared: FileAccessUser[] = []
      if (fileData?.shared_info) {
        const sharedInfo = fileData.shared_info
        shared.push({
          email: sharedInfo.contact_id || '',
          name: sharedInfo.contact_name,
          role: 'Relay',
          status: sharedInfo.status || 'active',
          expiry: sharedInfo.expiry_time || null,
          timestamp: sharedInfo.timestamp || null,
          permissions: [],
        })
      }

      // Process Forwarded users - forwarded_list is an array (in file or at data level)
      const forwarded: FileAccessUser[] = []
      const forwardedList = fileData?.forwarded_list ?? data?.forwarded_list ?? []
      if (Array.isArray(forwardedList)) {
        forwardedList.forEach((user: any) => {
          forwarded.push({
            email: user.contact_id || '',
            name: user.contact_name,
            role: 'Forwardee',
            status: user.status || 'active',
            expiry: user.expiry_time ?? null,
            timestamp: user.timestamp ?? null,
            permissions: [],
          })
        })
      }

      setSharedUsers(shared)
      setForwardedUsers(forwarded)

      // Set file name from API response or fallback to prop
      if (data.file_name) {
        setDisplayFileName(data.file_name)
      } else if (fileName) {
        setDisplayFileName(fileName)
      } else if (filePath) {
        setDisplayFileName(basename(filePath))
      }

      // Determine if current app user is the owner of the file
      try {
        const accountInfo = await BackendRemote.rpc.getAccountInfo(accountId)
        const currentEmail = accountInfo.kind === 'Configured' ? accountInfo.addr : null
        const ownerEmail = fileData?.owner_info?.contact_id || null

        if (
          currentEmail &&
          ownerEmail &&
          currentEmail.toLowerCase() === ownerEmail.toLowerCase()
        ) {
          setIsOwner(true)
        } else {
          setIsOwner(false)
        }
      } catch (e) {
        console.error('Error determining file owner for lock button:', e)
        setIsOwner(false)
      }
    } catch (err) {
      console.error('Error fetching file access status:', err)
      setError(
        err instanceof Error ? err.message : 'Failed to fetch file access status'
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchFileAccessStatus()
  }, [chatId, filePath])

  function PrivittyConfirmDialog({
    onAccept,
    onDenied,
    onClose,
  }: {
    onAccept: () => void
    onDenied: () => void
    onClose: () => void
  }) {
    return (
      <DialogWithHeader title='File Access Request' onClose={onClose}>
        <DialogBody>
          <DialogContent>
            <p style={{ marginBottom: 20 }}>
              Do you want to allow access for this file?
            </p>

            <div
              style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}
            >
              <button onClick={onDenied}>Denied</button>
              <button onClick={onAccept}>Accept</button>
            </div>
          </DialogContent>
        </DialogBody>
      </DialogWithHeader>
    )
  }

  function PrivittyProcessDialog({
    onSave,
    onClose,
  }: {
    onSave: (value: { allowDownload: boolean; allowedTime: string }) => void
    onClose: () => void
  }) {
    const [allowDownload, setAllowDownload] = useState(false)
    const [allowedTime, setAllowedTime] = useState('')

    return (
      <DialogWithHeader title='File Attributes' onClose={onClose}>
        <DialogBody>
          <DialogContent>
            {/* Allow Download */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type='checkbox'
                checked={allowDownload}
                onChange={e => setAllowDownload(e.target.checked)}
              />
              Allow Download
            </label>

            {/* Time Access */}
            <div style={{ marginTop: 16 }}>
              <label style={{ display: 'block', marginBottom: 4 }}>
                Time Access
              </label>
              <input
                type='time'
                value={allowedTime}
                onChange={e => setAllowedTime(e.target.value)}
              />
            </div>

            {/* Actions */}
            <div
              style={{
                marginTop: 24,
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 12,
              }}
            >
              <button onClick={onClose}>Cancel</button>
              <button
                onClick={() =>
                  onSave({
                    allowDownload,
                    allowedTime,
                  })
                }
              >
                Save
              </button>
            </div>
          </DialogContent>
        </DialogBody>
      </DialogWithHeader>
    )
  }

  const handleLockClick = async (contactId: string) => {
    const dialogId = await openDialog(PrivittyConfirmDialog, {
      onAccept: async () => {
        closeAllDialogs()
        try {
          const response = await runtime.PrivittySendMessage('sendEvent', {
            event_type: 'initRevertRelayForwardAccessAccept',
            event_data: {
              chat_id: String(chatId),
              file_path: filePath,
              contact_id: contactId,
              access_duration: 86400,
            },
          })

          const parsed = JSON.parse(response).result?.data?.pdu

          if (parsed) {
            // Extract the PDU base64 string directly
            const pdu = parsed
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

            const msgId = await BackendRemote.rpc.sendMsg(
              accountId,
              chatId || 0,
              {
                ...MESSAGE_DEFAULT,
                ...message,
              }
            )
            console.log('✅ Message sent successfully with ID:', msgId)
          } else {
            runtime.showNotification({
              title: 'Privitty',
              body: 'Privitty ADD peer state =' + parsed,
              icon: null,
              chatId: 0,
              messageId: 0,
              accountId,
              notificationType: 0,
            })
            return
          }
          runtime.showNotification({
            title: 'Privitty',
            body: 'Enabling Privitty security',
            icon: null,
            chatId: 0,
            messageId: 0,
            accountId,
            notificationType: 0,
          })

          console.log('Access accepted successfully')
        } catch (err) {
          console.error('Failed to accept access:', err)
        } finally {
          // refresh list so shared/forwarded status updates after accept
          await fetchFileAccessStatus()
        }
        // await openPrivittyProcess()
      },
      onDenied: async () => {
        closeAllDialogs()
        try {
          const response = await runtime.PrivittySendMessage('sendEvent', {
            event_type: 'initRevertRelayForwardAccessDenied',
            event_data: {
              chat_id: String(chatId),
              file_path: filePath,
              contact_id: contactId,
              denial_reason: 'File access not authorized for forwarding',
            },
          })

          const parsed = JSON.parse(response).result?.data?.pdu

          if (parsed) {
            // Extract the PDU base64 string directly
            const pdu = parsed
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

            const msgId = await BackendRemote.rpc.sendMsg(
              accountId,
              chatId || 0,
              {
                ...MESSAGE_DEFAULT,
                ...message,
              }
            )
            console.log('✅ Message sent successfully with ID:', msgId)
          } else {
            runtime.showNotification({
              title: 'Privitty',
              body: 'Privitty ADD peer state =' + parsed,
              icon: null,
              chatId: 0,
              messageId: 0,
              accountId,
              notificationType: 0,
            })
            return
          }
          runtime.showNotification({
            title: 'Privitty',
            body: 'Enabling Privitty security',
            icon: null,
            chatId: 0,
            messageId: 0,
            accountId,
            notificationType: 0,
          })

          console.log('Access accepted successfully')
        } catch (err) {
          console.error('Failed to accept access:', err)
        } finally {
          // refresh list so shared/forwarded status updates after denied
          await fetchFileAccessStatus()
        }
        console.log('Access denied')
      },
      onClose: () => {
        closeAllDialogs()
      },
    })
  }

  const handleBlockClick = async (contactId: string) => {
    try {
      const response = await runtime.PrivittySendMessage('sendEvent', {
        event_type: 'initAccessRevokeRequest',
        event_data: {
          chat_id: String(chatId),
          file_path: filePath,
          contact_id: contactId,
        },
      })

      const parsed = JSON.parse(response).result?.data?.pdu

      if (parsed) {
        // Extract the PDU base64 string directly
        const pdu = parsed
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

        const msgId = await BackendRemote.rpc.sendMsg(accountId, chatId || 0, {
          ...MESSAGE_DEFAULT,
          ...message,
        })
        console.log('✅ Message sent successfully with ID:', msgId)
      } else {
        runtime.showNotification({
          title: 'Privitty',
          body: 'Privitty ADD peer state =' + parsed,
          icon: null,
          chatId: 0,
          messageId: 0,
          accountId,
          notificationType: 0,
        })
        return
      }
      runtime.showNotification({
        title: 'Privitty',
        body: 'Enabling Privitty security',
        icon: null,
        chatId: 0,
        messageId: 0,
        accountId,
        notificationType: 0,
      })
    } finally {
      // refresh list so revoked user updates immediately
      await fetchFileAccessStatus()
    }
  }

  const formatTimestamp = (
    timestamp: string | number | null | undefined
  ): string => {
    if (!timestamp) return ''
    const date =
      typeof timestamp === 'string'
        ? new Date(timestamp)
        : new Date(timestamp * 1000)
    if (isNaN(date.getTime())) return ''
    const month = date.toLocaleDateString('en-US', { month: 'short' })
    const day = date.getDate()
    const year = date.getFullYear()
    const hours = date.getHours()
    const minutes = date.getMinutes().toString().padStart(2, '0')
    return `${month} ${day}, ${year} ${hours}:${minutes}`
  }

  const formatStatus = (status: string): string => {
    const statusMap: Record<string, string> = {
      active: 'Active',
      expired: 'Expired',
      revoked: 'Revoked',
      requested: 'Access Requested',
      relay_to_owner: 'Access Requested',
      denied: 'Denied',
      waiting_owner_action: 'Waiting Owner Action',
    }
    return statusMap[status] || status
  }

  const getDisplayFileName = (): string => {
    if (fileName) return fileName
    if (filePath) return basename(filePath)
    return 'File'
  }

  const UserCard = ({
    user,
    showPadlock = false,
    showLockButton = false,
    onLockClick,
    onBlockClick,
  }: {
    user: FileAccessUser
    showPadlock?: boolean
    showLockButton?: boolean
    onLockClick?: (contactId: string) => void
    onBlockClick?: (contactId: string) => void
  }) => {
    const displayName = user.name || user.email || 'Unknown'
    const initial = avatarInitial(displayName, user.email)
    const timestamp = user.timestamp ? formatTimestamp(user.timestamp) : null
    const status = isAccessRequested(user.status) ? formatStatus(user.status) : null

    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '12px 16px',
          borderBottom: '1px solid #e0e0e0',
          backgroundColor: '#fff',
        }}
      >
        {/* Avatar */}
        <div
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            backgroundColor: '#4a4a4a',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '16px',
            fontWeight: '500',
            marginRight: '12px',
            flexShrink: 0,
          }}
        >
          {initial}
        </div>

        {/* User Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: '15px',
              fontWeight: '500',
              color: '#000',
              marginBottom: '4px',
            }}
          >
            {displayName}
          </div>
          {(timestamp || status) && (
            <div
              style={{
                fontSize: '13px',
                color: '#666',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <span style={{ fontSize: '12px' }}>🕐</span>
              {status || timestamp}
            </div>
          )}
        </div>

        {/* Action buttons: Block (shared + forwarded), Lock (accept/deny request) */}
        {showPadlock &&
          isOwner &&
          (onBlockClick || (showLockButton && onLockClick)) && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              flexShrink: 0,
            }}
          >
            {onBlockClick && (
              <button
                onClick={() => onBlockClick(user.email)}
                style={{
                  width: '32px',
                  height: '32px',
                  border: 'none',
                  borderRadius: '4px',
                  backgroundColor: '#6750A4',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Icon icon='blocked' size={20} coloring={'#fff'} />
              </button>
            )}
            {showLockButton && onLockClick && (
              <button
                onClick={() => onLockClick(user.email)}
                style={{
                  width: '32px',
                  height: '32px',
                  border: 'none',
                  borderRadius: '4px',
                  backgroundColor: '#6750A4',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Icon icon='lock' size={20} coloring={'#fff'} />
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <DialogWithHeader title='Access Control' onClose={onClose}>
      <DialogBody>
        <DialogContent>
          {/* File Name */}
          <div
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid #e0e0e0',
              backgroundColor: '#fafafa',
            }}
          >
            <div
              style={{
                fontSize: '15px',
                fontWeight: '500',
                color: '#000',
              }}
            >
              {getDisplayFileName()}
            </div>
          </div>

          {loading && (
            <div
              style={{
                padding: '40px 20px',
                textAlign: 'center',
                color: '#666',
              }}
            >
              {tx('loading') || 'Loading...'}
            </div>
          )}

          {error && (
            <div
              style={{
                padding: '40px 20px',
                color: '#d32f2f',
                textAlign: 'center',
              }}
            >
              {error}
            </div>
          )}

          {!loading && !error && (
            <div style={{ backgroundColor: '#fafafa' }}>
              {/* Shared Section */}
              {sharedUsers.length > 0 && (
                <div>
                  <div
                    style={{
                      padding: '12px 20px',
                      fontSize: '14px',
                      fontWeight: '600',
                      color: '#666',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      borderBottom: '1px solid #e0e0e0',
                      backgroundColor: '#fff',
                    }}
                  >
                    Shared
                  </div>
                  <div style={{ backgroundColor: '#fff' }}>
                    {sharedUsers.map((user, index) => (
                      <UserCard
                        key={`shared-${index}`}
                        user={user}
                        showPadlock={true}
                        showLockButton={isAccessRequested(user.status)}
                        onBlockClick={handleBlockClick}
                        onLockClick={handleLockClick}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Forwarded Section */}
              {forwardedUsers.length > 0 && (
                <div>
                  <div
                    style={{
                      padding: '12px 20px',
                      fontSize: '14px',
                      fontWeight: '600',
                      color: '#666',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      borderTop:
                        sharedUsers.length > 0 ? '1px solid #e0e0e0' : 'none',
                      borderBottom: '1px solid #e0e0e0',
                      backgroundColor: '#fff',
                    }}
                  >
                    Forwarded
                  </div>
                  <div style={{ backgroundColor: '#fff' }}>
                    {forwardedUsers.map((user, index) => (
                      <UserCard
                        key={`forwarded-${index}`}
                        user={user}
                        showPadlock={true}
                        showLockButton={isAccessRequested(user.status)}
                        onBlockClick={handleBlockClick}
                        onLockClick={handleLockClick}
                      />
                    ))}
                  </div>
                </div>
              )}

              {sharedUsers.length === 0 && forwardedUsers.length === 0 && (
                <div
                  style={{
                    padding: '40px 20px',
                    textAlign: 'center',
                    color: '#666',
                  }}
                >
                  No access data available
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </DialogBody>
    </DialogWithHeader>
  )
}
