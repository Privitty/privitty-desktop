import React from 'react'
import { getBackgroundImageStyle } from './message/MessageListAndComposer'
import { useSettingsStore } from '../stores/settings'
import styles from './NoChatSelected.module.scss'
import Icon from './Icon'

export default function NoChatSelected() {
  const settingsStore = useSettingsStore()[0]

  const style: React.CSSProperties = settingsStore
    ? getBackgroundImageStyle(settingsStore.desktopSettings)
    : {}

  return (
    <div
      className={`message-list-and-composer ${styles.privittyWelcome}`}
      style={style}
    >
      <div className={styles.welcomeContainer}>
        {/* Header */}
        <div className={styles.welcomeHeader}>
          <h1>
            Your Data
            <br />
            In Your Control
          </h1>
          <p>
            Welcome to Privitty, A secure, decentralized messaging app with
            advanced privacy features like message revocation and time-limited
            access.
          </p>
        </div>

        {/* Feature Cards */}
        <div className={styles.welcomeGrid}>
          <div className={styles.welcomeCard}>
            <div className={styles.cardIcon}>
              <Icon icon='key' size={40} />
            </div>
            <h3>Machine Identity</h3>
            <p>
              Every Privitty Edge creates a permanent OpenPGP-verified identity
              on first activation. No IP addresses or shared credentials.
            </p>
          </div>

          <div className={styles.welcomeCard}>
            <div className={styles.cardIcon}>
              <Icon icon='file' size={40} />
            </div>
            <h3>Controlled File Transfer</h3>
            <p>
              Securely share PLC, HMI, and recipe files with view, download,
              forward, expiry, and revoke controls.
            </p>
          </div>

          <div className={styles.welcomeCard}>
            <div className={styles.cardIcon}>
              <Icon icon='devices' size={40} />
            </div>
            <h3>E2EE Remote Sessions</h3>
            <p>
              Identity-verified SSH, RDP, and VNC over end-to-end encryption. No
              inbound firewall ports required.
            </p>
          </div>

          <div className={styles.welcomeCard}>
            <div className={styles.cardIcon}>
              <Icon icon='blocked' size={40} />
            </div>
            <h3>True Revoke & Panic</h3>
            <p>
              Instantly revoke file access, terminate remote sessions, and log
              events with a single click.
            </p>
          </div>

          <div className={styles.welcomeCard}>
            <div className={styles.cardIcon}>
              <Icon icon='device' size={40} />
            </div>
            <h3>Software Only (~20 MB)</h3>
            <p>
              Lightweight Windows service for MELIPC and Windows IoT Enterprise.
              No additional hardware needed.
            </p>
          </div>

          <div className={styles.welcomeCard}>
            <div className={styles.cardIcon}>
              <Icon icon='network' size={40} />
            </div>
            <h3>MES/SCADA Integration</h3>
            <p>
              Local JSON-RPC API and SSE stream enable automated, secure file
              ingestion into MES and SCADA workflows.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
