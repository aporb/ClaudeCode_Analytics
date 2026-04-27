import fs from 'node:fs'
import path from 'node:path'
import type { NextConfig } from 'next'

// Load .env.local from the repo root so a fresh `git clone && pnpm install &&
// pnpm web` works without anyone manually creating a per-app symlink.
// Next.js auto-loads `.env.local` from this directory; we just hoist values
// from the repo root if they're not already in the environment.
const repoEnv = path.resolve(import.meta.dirname, '..', '..', '.env.local')
try {
  for (const line of fs.readFileSync(repoEnv, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim()
    if (key && !(key in process.env)) process.env[key] = val
  }
} catch {
  // No repo-root .env.local — operator must set env vars in the shell.
}

const config: NextConfig = {
  experimental: { externalDir: true },
}

export default config
