import React, { createContext, useContext, useEffect } from 'react'
import { runtime } from '@deltachat-desktop/runtime-interface'
import { BackendRemote, onDCEvent } from '../backend-com'
import { privittyStore } from '../privitty/privittyStore'

/**
 * PrivittyChatContext — orchestrates detection and populates privittyStore.
 *
 * The store is the single source of truth for which chats are Privitty-protected.
 * This context is responsible only for DETECTION (running the scan, subscribing
 * to events). The DISPLAY is handled directly by each Message component via
 * store.subscribe(), which guarantees re-renders regardless of any React.memo
 * or areEqual memoization in ancestor components (react-window, etc.).
 */

interface PrivittyChatContextValue {
  /** Mark a chat as Privitty-protected (also persists to localStorage). */
  markChatAsPrivitty: (chatId: number) => void
}

const PrivittyChatContext = createContext<PrivittyChatContextValue>({
  markChatAsPrivitty: () => {},
})

export function PrivittyChatProvider({
  accountId,
  children,
}: {
  accountId: number | undefined
  children: React.ReactNode
}) {
  // Tell the store which account is active so it can load its cache.
  if (accountId != null) {
    privittyStore.setActiveAccount(accountId)
  }

  const markChatAsPrivitty = (chatId: number) => {
    if (accountId != null) {
      privittyStore.markPrivitty(accountId, chatId)
    }
  }

  /**
   * Two-stage Privitty check for a single chat:
   *   Stage 1 — isChatProtected  (established connections)
   *   Stage 2 — isPrivittyMessage on the FULL last-message text
   *             (handshake PDUs and outgoing messages; avoids truncation)
   */
  const checkChat = async (
    chatId: number,
    lastMessageId: number | null | undefined
  ) => {
    if (accountId == null) return
    if (privittyStore.isPrivitty(accountId, chatId)) return
    try {
      const protResp = await runtime.PrivittySendMessage('isChatProtected', {
        chat_id: String(chatId),
      })
      const protParsed = JSON.parse(protResp)
      if (protParsed?.result?.is_protected === true) {
        privittyStore.markPrivitty(accountId, chatId)
        return
      }

      if (!lastMessageId) return
      const msg = await BackendRemote.rpc.getMessage(accountId, lastMessageId)
      if (!msg?.text) return

      const msgResp = await runtime.PrivittySendMessage('isPrivittyMessage', {
        base64_data: msg.text,
      })
      const msgParsed = JSON.parse(msgResp)
      if (msgParsed?.result?.is_valid === true) {
        privittyStore.markPrivitty(accountId, chatId)
      }
    } catch {
      // server not yet ready — will be retried via events
    }
  }

  const scanAllChats = async () => {
    if (accountId == null) return
    try {
      const chatIds = await BackendRemote.rpc.getChatlistEntries(
        accountId,
        null,
        null,
        null
      )
      const items = await BackendRemote.rpc.getChatlistItemsByEntries(
        accountId,
        chatIds
      )
      await Promise.allSettled(
        Object.entries(items)
          .filter(([, item]) => item?.kind === 'ChatListItem')
          .map(([chatIdStr, item]) => {
            if (item?.kind !== 'ChatListItem') return Promise.resolve()
            return checkChat(Number(chatIdStr), item.lastMessageId)
          })
      )
    } catch {
      // unexpected error — event streams keep the store updated
    }
  }

  // Primary trigger: privittyServerReady fires after switchProfile response,
  // guaranteeing the server's user DB is fully set up before the scan runs.
  // 30 s fallback prevents the scan from never running if the event is missed.
  useEffect(() => {
    let cancelled = false
    const fallbackTimer = window.setTimeout(() => {
      if (!cancelled) {
        privittyStore.setServerReady()
        scanAllChats()
      }
    }, 30_000)

    const unsubscribe = runtime.onPrivittyServerReady(async () => {
      if (cancelled) return
      window.clearTimeout(fallbackTimer)
      // Signal all waiting components (e.g. file status fetches in Message.tsx)
      // that the server is ready before we run the scan.
      privittyStore.setServerReady()
      await scanAllChats()
    })

    return () => {
      cancelled = true
      window.clearTimeout(fallbackTimer)
      unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId])

  // Re-check the specific chat whenever its last message changes.
  useEffect(() => {
    if (accountId == null) return
    return onDCEvent(accountId, 'ChatlistItemChanged', async ({ chatId }) => {
      if (!chatId || privittyStore.isPrivitty(accountId, chatId)) return
      try {
        const items = await BackendRemote.rpc.getChatlistItemsByEntries(
          accountId,
          [chatId]
        )
        const item = items[chatId]
        if (item?.kind === 'ChatListItem') {
          await checkChat(chatId, item.lastMessageId)
        }
      } catch {
        // ignore
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId])

  // Real-time: main process fires this the instant it validates an incoming PDU.
  useEffect(() => {
    return runtime.onPrivittyMessageDetected(chatId => {
      if (accountId != null) {
        privittyStore.markPrivitty(accountId, chatId)
      }
    })
  }, [accountId])

  return (
    <PrivittyChatContext.Provider value={{ markChatAsPrivitty }}>
      {children}
    </PrivittyChatContext.Provider>
  )
}

export const usePrivittyChatContext = () => useContext(PrivittyChatContext)
