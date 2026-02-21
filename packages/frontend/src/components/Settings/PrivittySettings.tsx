import React, { useEffect, useState } from 'react'

import type { SettingsStoreState } from '../../stores/settings'
import DesktopSettingsSwitch from './DesktopSettingsSwitch'
import useTranslationFunction from '../../hooks/useTranslationFunction'

import { DeltaInput } from '../Login-Styles'
import { I18nContext } from '../../contexts/I18nContext'
import classNames from 'classnames'
import styles from './styles.module.scss'
import { runtime } from '@deltachat-desktop/runtime-interface'

type Props = {
  settingsStore: SettingsStoreState
}
export function PrivittySettings({ settingsStore: _settingsStore }: Props) {
  const tx = useTranslationFunction()
  //
  const [configValue, setConfigValue] = useState(25)
  //  desktopSettings.privittyDefaultAccessTime || 25
  useEffect(() => {
    runtime.getDesktopSettings().then(settings => {
      setConfigValue(settings.privittyDefaultAccessTime || 25)
    })
  })
  // let defaultAccessTime = settingsStore.desktopSettings.privittyDefaultAccessTime || 25

  const onTimeChange = async (
    event: React.FormEvent<HTMLElement> & React.ChangeEvent<HTMLInputElement>
  ) => {
    const defaultVal = event.target.value
    if (defaultVal === '') {
      //settingsStore.desktopSettings.privittyDefaultAccessTime = 25
      //setConfigValue(25)
      return
    } else {
      await runtime
        .setDesktopSetting(
          'privittyDefaultAccessTime',
          parseInt(defaultVal, 10)
        )
        .then(() => {
          //settingsStore.desktopSettings.privittyDefaultAccessTime = parseInt(defaultVal, 10)
          setConfigValue(parseInt(defaultVal, 10))
        })

      setConfigValue(parseInt(defaultVal, 10))
    }
  }

  const onTimeBlur = async (
    event: React.FormEvent<HTMLElement> & React.FocusEvent<HTMLInputElement>
  ) => {
    const defaultVal = event.target.value
    if (defaultVal === '') {
      //settingsStore.desktopSettings.privittyDefaultAccessTime = 25
      return
    } else {
      await runtime
        .setDesktopSetting(
          'privittyDefaultAccessTime',
          parseInt(defaultVal, 10)
        )
        .then(() => {
          setConfigValue(parseInt(defaultVal, 10))
        })
    }
    setConfigValue(parseInt(defaultVal, 10))
  }

  return (
    <>
      <I18nContext.Consumer>
        {tx => (
          <div className={classNames(styles.settingsSwitch)}>
            <DeltaInput
              key='DefaultAccessTime'
              id='DefaultAccessTime'
              placeholder={tx('default_access_time')}
              value={configValue}
              onChange={onTimeChange}
              onBlur={onTimeBlur}
            />
          </div>
        )}
      </I18nContext.Consumer>
      <DesktopSettingsSwitch
        settingsKey='privittyNotifyOnAccess'
        label={tx('privitty_access_notify')}
        description={tx('privitty_access_notify_description')}
      />
      <DesktopSettingsSwitch
        settingsKey='privittyNotifyOnForwardAccess'
        label={tx('privitty_access_forward_notify')}
        description={tx('privitty_access_forward_notify_description')}
      />
    </>
  )
}
