#!/usr/bin/env node

import { spawn } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'
import electron from 'electron'

const packageRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

process.env.NODE_OPTIONS = [process.env.NODE_OPTIONS, '--enable-source-maps']
  .filter(Boolean)
  .join(' ')

const args = [
  '.',
  '--devmode',
  '--disable-http-cache',
  '--translation-watch',
  ...process.argv.slice(2),
]

const child = spawn(electron, args, {
  cwd: packageRoot,
  env: process.env,
  stdio: 'inherit',
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 1)
})
