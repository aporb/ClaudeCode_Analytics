import '@testing-library/jest-dom/vitest'
import fs from 'node:fs'
import path from 'node:path'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Load .env.local for real-DB tests. Try `apps/web/.env.local` first (a
// developer convenience symlink) then fall back to the repo-root `.env.local`
// so `git clone && pnpm install && pnpm test` works without any extra steps.
const candidates = [
  path.resolve(import.meta.dirname, '.env.local'),
  path.resolve(import.meta.dirname, '..', '..', '.env.local'),
]
for (const envPath of candidates) {
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
    break // first candidate that exists wins
  } catch {
    // try the next candidate
  }
}

afterEach(cleanup)
