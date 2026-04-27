import '@testing-library/jest-dom/vitest'
import fs from 'node:fs'
import path from 'node:path'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Load .env.local for real-DB tests (symlink resolved automatically by Node fs)
const envPath = path.resolve(import.meta.dirname, '.env.local')
try {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim()
    if (key && !(key in process.env)) process.env[key] = val
  }
} catch {
  // .env.local not present; env vars must come from the shell
}

afterEach(cleanup)
