// PDFViewer.tsx
import React, { useEffect, useRef } from 'react'
import { PDFDocumentProxy } from 'pdfjs-dist'

declare global {
  interface Window {
    pdfjsLib: any
  }
}

const PDFViewer: React.FC<{ filePath: string }> = ({ filePath }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const loadPDF = async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- dynamic import for pdfjs-dist
      const pdfjsLib = require('pdfjs-dist')

      // Set worker source to use the correct version
      try {
        // First, try to use the local worker file
        const workerPath = 'pdf.worker.min.mjs'
        const workerResponse = await fetch(workerPath)
        if (workerResponse.ok) {
          const workerBlob = await workerResponse.blob()
          const workerBlobUrl = URL.createObjectURL(workerBlob)
          pdfjsLib.GlobalWorkerOptions.workerSrc = workerBlobUrl
        } else {
          throw new Error(
            `Worker file not accessible: ${workerResponse.status}`
          )
        }
      } catch (_blobError) {
        // Fallback: try to disable worker and use main thread
        try {
          // Set workerSrc to null to disable worker (this is the correct way)
          pdfjsLib.GlobalWorkerOptions.workerSrc = null
        } catch (_disableError) {
          // Final fallback to CDN with matching version
          pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`
        }
      }

      const loadingTask = pdfjsLib.getDocument(filePath)
      const pdf: PDFDocumentProxy = await loadingTask.promise

      // Get first page
      const page = await pdf.getPage(1)
      const viewport = page.getViewport({ scale: 1.5 })

      const canvas = canvasRef.current
      if (!canvas) return

      const context = canvas.getContext('2d')
      if (!context) return

      canvas.height = viewport.height
      canvas.width = viewport.width

      await page.render({
        canvasContext: context,
        viewport: viewport,
      }).promise
    }

    loadPDF().catch(console.error)
  }, [filePath])

  return (
    <div className='pdf-viewer'>
      <canvas ref={canvasRef} />
    </div>
  )
}

export default PDFViewer
