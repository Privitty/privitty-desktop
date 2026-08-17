import { useCallback } from 'react'

import useKeyBindingAction from '../hooks/useKeyBindingAction'
import useDialog from '../hooks/dialog/useDialog'
import useChat from '../hooks/chat/useChat'
import { KeybindAction } from '../keybindings'
import { Screens } from '../ScreenController'
import { ChatView } from '../contexts/ChatContext'

/**
 * Handles Escape globally: dismisses the topmost active UI layer, then
 * unselects the current chat to show {@link NoChatSelected}.
 *
 * Component-specific Escape handlers (dialogs, context menus, settings
 * sub-views, etc.) run first; this handler only acts when nothing else
 * consumed the key press.
 */
export default function GlobalEscapeHandler() {
  const { openDialogIds } = useDialog()
  const { chatId, unselectChat, activeView, setChatView } = useChat()

  const handleGlobalDismiss = useCallback(() => {
    if (window.__contextMenuActive) {
      return
    }

    if (window.__settingsOpened && window.__settingsInSubView) {
      return
    }

    // Let the native `<dialog>` cancel handler close dialogs on Escape.
    if (openDialogIds.length > 0) {
      return
    }

    if (window.__isReactionsBarShown) {
      window.__hideReactionsBar?.()
      return
    }

    if (window.__screen !== Screens.Main) {
      return
    }

    if (window.__chatlistIsSearchActive?.()) {
      window.__chatlistClearSearch?.()
      return
    }

    if (window.__chatlistIsArchivedView?.()) {
      window.__chatlistExitArchivedView?.()
      return
    }

    if (activeView === ChatView.Media) {
      setChatView(ChatView.MessageList)
      return
    }

    if (chatId !== undefined) {
      unselectChat()
    }
  }, [openDialogIds, chatId, unselectChat, activeView, setChatView])

  useKeyBindingAction(KeybindAction.Global_Dismiss, handleGlobalDismiss)

  return null
}
