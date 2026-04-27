import path from 'node:path'
import { getDb } from '@cca/db'
import { loadRemotesConfig } from './config.js'
import { detectInstalledRsyncVersion } from './rsync.js'
import { type RunHostResult, runHost } from './runHost.js'
import { resetState } from './state.js'

export interface RunSyncOptions {
  repoRoot: string
  configPath?: string
  force?: boolean
  host?: string // optional: limit to one host
}

export async function runSync(opts: RunSyncOptions): Promise<RunHostResult[]> {
  const configPath = opts.configPath ?? path.join(opts.repoRoot, 'cca.remotes.json')
  const remotes = loadRemotesConfig(configPath)
  const filtered = opts.host ? remotes.filter((r) => r.host === opts.host) : remotes
  if (filtered.length === 0) {
    throw new Error(opts.host ? `unknown host: ${opts.host}` : 'no remotes configured')
  }

  const rsyncVersion = await detectInstalledRsyncVersion()
  if (!rsyncVersion) throw new Error('rsync not found in PATH')

  const db = getDb()
  const force = opts.force ?? false
  const results: RunHostResult[] = []
  for (const remote of filtered) {
    const r = await runHost({ db, repoRoot: opts.repoRoot, remote, rsyncVersion, force })
    results.push(r)
  }
  return results
}

export async function resetHostState(host: string): Promise<void> {
  const db = getDb()
  await resetState(db, host)
}
