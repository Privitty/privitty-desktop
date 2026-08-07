import React from 'react'

import SettingsStoreInstance, { useSettingsStore } from '../../stores/settings'
import DesktopSettingsSwitch from './DesktopSettingsSwitch'
import useTranslationFunction from '../../hooks/useTranslationFunction'
import SettingsSwitch from './SettingsSwitch'
import { runtime } from '@deltachat-desktop/runtime-interface'

export function ExperimentalFeatures() {
  const tx = useTranslationFunction()

  return (
    <>
      <DesktopSettingsSwitch
        settingsKey='enableBroadcastLists'
        label={tx('broadcast_lists')}
        description={tx('chat_new_broadcast_hint')}
      />
      <DesktopSettingsSwitch
        settingsKey='enableOnDemandLocationStreaming'
        label={tx('pref_on_demand_location_streaming')}
      />
      <DesktopSettingsSwitch
        settingsKey='enableChatAuditLog'
        label={tx('menu_chat_audit_log')}
        description={tx('chat_audit_log_description')}
      />
      <DesktopSettingsSwitch
        settingsKey='enableRelatedChats'
        label={tx('related_chats')}
      />
      <DesktopSettingsSwitch
        settingsKey='experimentalEnableMarkdownInMessages'
        label='Render Markdown in Messages'
      />
      {runtime.getRuntimeInfo().isContentProtectionSupported && (
        <DesktopSettingsSwitch
          settingsKey='contentProtectionEnabled'
          label={tx('pref_screen_security')}
          description={tx('pref_screen_security_explain')}
        />
      )}
      <SyncAllAccountsSwitch />
      <DesktopSettingsSwitch
        settingsKey='enableWebxdcDevTools'
        label='Enable Webxdc Devtools'
        description='Careful: opening developer tools on a malicious webxdc app could lead to the app getting access to the Internet'
      />
    </>
  )
}

export default function SyncAllAccountsSwitch() {
  const tx = useTranslationFunction()
  const settingsStore = useSettingsStore()[0]!

  return (
    <SettingsSwitch
      label={tx('pref_background_sync_disabled')}
      description={tx('explain_background_sync_disabled')}
      value={settingsStore.desktopSettings.syncAllAccounts !== true}
      onChange={() => {
        SettingsStoreInstance.effect.setDesktopSetting(
          'syncAllAccounts',
          !settingsStore.desktopSettings.syncAllAccounts
        )
      }}
    />
  )
}
