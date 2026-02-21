#!/usr/bin/env node

import fs from 'fs'
import path from 'path'

const sourceFile = 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs'
const dest1 = 'html-dist/pdf.worker.min.mjs'
const dest2 = 'static/pdf.worker.min.mjs'

try {
  // Ensure destination directories exist
  const htmlDistDir = path.dirname(dest1)
  const staticDir = path.dirname(dest2)

  if (!fs.existsSync(htmlDistDir)) {
    fs.mkdirSync(htmlDistDir, { recursive: true })
  }

  if (!fs.existsSync(staticDir)) {
    fs.mkdirSync(staticDir, { recursive: true })
  }

  // Copy the file to both destinations
  fs.copyFileSync(sourceFile, dest1)
  fs.copyFileSync(sourceFile, dest2)

  console.log(`✅ Successfully copied PDF worker to ${dest1} and ${dest2}`)
} catch (error) {
  console.error(`❌ Error copying PDF worker: ${error.message}`)
  process.exit(1)
}
