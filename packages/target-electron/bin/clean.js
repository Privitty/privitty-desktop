#!/usr/bin/env node

import fs from 'fs'
import path from 'path'

const dirsToClean = ['./bundle_out', './html-dist', './dist']

function rmrf(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return
  }

  const files = fs.readdirSync(dirPath)
  for (const file of files) {
    const curPath = path.join(dirPath, file)
    if (fs.lstatSync(curPath).isDirectory()) {
      rmrf(curPath)
    } else {
      fs.unlinkSync(curPath)
    }
  }
  fs.rmdirSync(dirPath)
}

try {
  for (const dir of dirsToClean) {
    if (fs.existsSync(dir)) {
      rmrf(dir)
      console.log(`✅ Cleaned directory: ${dir}`)
    } else {
      console.log(`ℹ️  Directory does not exist: ${dir}`)
    }
  }
  console.log('🎉 Clean completed successfully')
} catch (error) {
  console.error(`❌ Error during clean: ${error.message}`)
  process.exit(1)
}
