import { runtime } from '@deltachat-desktop/runtime-interface'

import { getLogger } from '../../../shared/logger'

const log = getLogger('renderer/cleanupDraftAttachmentFile')

/** DeltaChat core copies draft attachments into this folder; do not delete directly. */
export function isDeltaChatBlobPath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/')
  return (
    normalized.includes('/dc.db-blobs/') ||
    normalized.includes('/.sqlite-blobs/')
  )
}

/** Files written by writeTempFileFromBase64 / writeTempFile for draft attachments. */
export function isDraftTempPath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/')
  return (
    normalized.includes('/chat.privitty.desktop-draft/') ||
    normalized.includes('/chat.deltachat.desktop-draft/')
  )
}

/**
 * Deletes a local draft attachment file that the frontend owns.
 * Skips DeltaChat-managed blob paths in dc.db-blobs.
 */
export async function cleanupLocalDraftAttachmentFile(
  filePath: string
): Promise<void> {
  if (!filePath) {
    return
  }

  if (isDeltaChatBlobPath(filePath)) {
    log.debug('Skipping cleanup of DeltaChat-managed blob path', filePath)
    return
  }

  const normalized = filePath.replace(/\\/g, '/')

  if (normalized.toLowerCase().endsWith('.prv')) {
    try {
      // deleteEncryptedFile is idempotent (ENOENT is treated as success).
      await runtime.deleteEncryptedFile(filePath)
      log.debug('Deleted encrypted draft attachment', filePath)
    } catch (err) {
      log.error('Failed to delete encrypted draft attachment', filePath, err)
    }
    return
  }

  if (isDraftTempPath(filePath)) {
    try {
      await runtime.removeTempFile(filePath)
      log.debug('Deleted temp draft attachment', filePath)
    } catch (err) {
      log.error('Failed to delete temp draft attachment', filePath, err)
    }
    return
  }

  log.debug('No cleanup needed for draft attachment path', filePath)
}
