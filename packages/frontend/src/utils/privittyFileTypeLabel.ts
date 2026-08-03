/**
 * Privitty file type labels — mirrors Android DocumentView.getFileTypeName()
 * and getSecondToLastExtension() for `.prv` attachments (e.g. `doc.pdf.prv` → pdf).
 */

export function getSecondToLastExtension(fileName: string): string {
  const parts = fileName.split('.').filter(Boolean)
  if (parts.length === 0) return ''
  const lastPart = parts[parts.length - 1].toLowerCase()
  if (lastPart === 'prv' && parts.length >= 3) {
    return parts[parts.length - 2].toLowerCase()
  }
  return lastPart
}

/** Human-readable type label shown above Privitty file bubbles (e.g. "PDF File"). */
export function getPrivittyFileTypeLabel(
  fileName: string | null | undefined
): string {
  const extension = getSecondToLastExtension(fileName || '')
  if (!extension) return 'Document'

  if (extension === 'pdf') return 'PDF'

  if (
    ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'ico'].includes(
      extension
    )
  ) {
    return 'Image'
  }

  if (
    ['mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm', '3gp', 'm4v'].includes(
      extension
    )
  ) {
    return 'Video'
  }

  if (['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'].includes(extension)) {
    return 'Audio File'
  }

  if (['doc', 'docx'].includes(extension)) return 'Doc File'

  if (['xls', 'xlsx', 'ods', 'csv'].includes(extension)) return 'XLS File'

  if (['ppt', 'pptx', 'odp'].includes(extension)) return 'PPT File'

  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(extension)) return 'ZIP File'

  return 'Document'
}

/** CSS modifier for `.file-icon` — mirrors {@link getPrivittyFileTypeLabel}. */
export function getPrivittyFileGradientIconClass(
  fileName: string | null | undefined
): 'file-icon-image' | 'file-icon-video' | null {
  switch (getPrivittyFileTypeLabel(fileName)) {
    case 'Image':
      return 'file-icon-image'
    case 'Video':
      return 'file-icon-video'
    default:
      // PDF and all other types use the default file-gradient.svg in CSS.
      return null
  }
}
