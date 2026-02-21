// SecureViewer.tsx
import React, { useEffect, useState } from 'react'
import PDFViewer from './PDFViewer'
//import ImageViewer from './ImageViewer';
//import VideoViewer from './VideoViewer';
//import TextViewer from './TextViewer';

declare global {
  interface Window {
    secureViewerAPI: {
      getFileData: () => string
    }
  }
}

const SecureViewer: React.FC = () => {
  const [filePath, setFilePath] = useState<string | null>(null)
  const [fileType, setFileType] = useState<string | null>(null)

  useEffect(() => {
    const path = window.secureViewerAPI.getFileData()
    setFilePath(path)

    if (path) {
      const extension = path.split('.').pop()?.toLowerCase()
      setFileType(extension || null)
    }
  }, [])

  if (!filePath || !fileType) {
    return <div className='loading'>Loading file...</div>
  }

  const renderViewer = () => {
    switch (fileType) {
      case 'pdf':
        return <PDFViewer filePath={filePath} />
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
      case 'bmp':
        // return <ImageViewer filePath={filePath} />;
        break
      case 'mp4':
      case 'webm':
      case 'ogg':
        // return <VideoViewer filePath={filePath} />;
        break
      case 'txt':
        // return <TextViewer filePath={filePath} />;
        break
      default:
        return <div>Unsupported file type</div>
    }
  }

  return <div className='secure-viewer-container'>{renderViewer()}</div>
}

export default SecureViewer
