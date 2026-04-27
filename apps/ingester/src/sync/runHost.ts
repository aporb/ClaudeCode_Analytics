import path from 'node:path'
import pc from 'picocolors'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as schema from '@cca/db/schema'
import { backfillAll } from '../backfill/orchestrator.js'
import { advanceBackoff, isDue, type BackoffInputState } from './backoff.js'
import type { RemoteEntry } from './config.js'
import { withHostLock } from './lock.js'
import { runRsync, type RsyncVersion } from './rsync.js'
import { loadState, upsertState } from './state.js'

type Db = PostgresJsDatabase<typeof schema>

export interface RunHostOptions {
  db: Db
  repoRoot: string
  remote: RemoteEntry
  rsyncVersion: RsyncVersion
  force?: boolean
  // Test seam — production passes the real runRsync.
  rsyncFn?: typeof runRsync
}

export type RunHostResult =
  | { kind: 'skipped-not-due'; host: string }
  | { kind: 'skipped-empty'; host: string; state: BackoffInputState }
  | { kind: 'ingested'; host: string; state: BackoffInputState }
  | { kind: 'error'; host: string; state: BackoffInputState; message: string }

export async function runHost(opts: RunHostOptions): Promise<RunHostResult> {
  const { db, repoRoot, remote, rsyncVersion, force = false, rsyncFn = runRsync } = opts
  const mirrorDir = path.join(repoRoot, '.cca', 'remotes', remote.host)
  const claudeMirror = path.join(mirrorDir, '.claude')

  return withHostLock(mirrorDir, async () => {
    const prev = await loadState(db, remote.host)
    const now = new Date()

    if (!force && !isDue(prev, now)) {
      console.log(pc.dim(`[sync] ${remote.host}: not due (last pulled ${prev.lastPulledAt?.toISOString() ?? 'never'}, interval ${prev.currentIntervalHours}h)`))
      return { kind: 'skipped-not-due', host: remote.host }
    }

    console.log(pc.dim(`[sync] ${remote.host}: rsync from ${remote.ssh}:${remote.claudeHome}`))
    const outcome = await rsyncFn(remote.ssh, remote.claudeHome, claudeMirror, rsyncVersion)

    if (outcome.kind === 'error') {
      const next = advanceBackoff(prev, { kind: 'error', message: outcome.stderr }, now)
      await upsertState(db, remote.host, next)
      console.error(pc.red(`[sync] ${remote.host}: rsync failed (exit ${outcome.exitCode}): ${outcome.stderr.trim().slice(0, 200)}`))
      return { kind: 'error', host: remote.host, state: next, message: outcome.stderr }
    }

    if (outcome.kind === 'success-empty') {
      const next = advanceBackoff(prev, 'empty', now)
      await upsertState(db, remote.host, next)
      console.log(pc.dim(`[sync] ${remote.host}: no new data (next interval ${next.currentIntervalHours}h)`))
      return { kind: 'skipped-empty', host: remote.host, state: next }
    }

    // Non-empty success: ingest
    console.log(pc.dim(`[sync] ${remote.host}: ${outcome.stats.filesTransferred ?? '?'} files transferred → ingest`))
    await backfillAll(claudeMirror, { host: remote.host })

    const next = advanceBackoff(prev, 'non-empty', now)
    await upsertState(db, remote.host, next)
    console.log(pc.green(`[sync] ${remote.host}: ingest complete`))
    return { kind: 'ingested', host: remote.host, state: next }
  })
}
