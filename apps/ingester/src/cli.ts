import { config } from 'dotenv'
import path, { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
config({ path: resolve(process.cwd(), '../../.env.local') })

import { Command } from 'commander'
import { sql } from 'drizzle-orm'
import { closeDb, getDb } from '@cca/db'
import { rollupSessions } from './writer/deriveSessions.js'
import { backfillAll } from './backfill/orchestrator.js'
import { startDaemon } from './daemon/index.js'

const program = new Command()
program.name('cca-ingester').description('CCA ingester commands')

program
  .command('backfill')
  .description('Backfill all data under $CLAUDE_HOME (default: ~/.claude)')
  .option('--concurrency <n>', 'parallel file readers', '6')
  .action(async (opts) => {
    const home = process.env.CLAUDE_HOME ?? `${process.env.HOME}/.claude`
    await backfillAll(home, { concurrency: Number(opts.concurrency), host: 'local' })
    await closeDb()
  })

program
  .command('rebuild-derived')
  .description('Recompute derived tables (sessions) for all sessions in events')
  .action(async () => {
    const db = getDb()
    const rows = await db.execute<{ session_id: string }>(sql`SELECT DISTINCT session_id FROM events`)
    const sessionIds = rows.map((r) => r.session_id)
    const batchSize = 500
    for (let i = 0; i < sessionIds.length; i += batchSize) {
      await rollupSessions(db, sessionIds.slice(i, i + batchSize))
    }
    console.log(`rebuilt ${sessionIds.length} sessions`)
    await closeDb()
  })

program
  .command('daemon')
  .description('Run the live tailer + hook relay daemon')
  .option('--port <n>', 'HTTP port for hook relay + SSE', '9939')
  .action(async (opts) => {
    const home = process.env.CLAUDE_HOME ?? `${process.env.HOME}/.claude`
    await startDaemon({ claudeHome: home, port: Number(opts.port) })
  })

program
  .command('sync')
  .description('Pull remote Claude Code data via SSH+rsync and ingest tagged with host')
  .option('--force', 'skip the per-host due check', false)
  .option('--host <name>', 'sync a single host only')
  .option('--reset-state <name>', 'delete host_sync_state row for <name> (does not delete data)')
  .action(async (opts) => {
    if (opts.resetState) {
      const { resetHostState } = await import('./sync/index.js')
      await resetHostState(opts.resetState)
      console.log(`reset state for ${opts.resetState}`)
      await closeDb()
      return
    }
    const { runSync } = await import('./sync/index.js')
    // Resolve repoRoot from this source file's location, not process.cwd().
    // cli.ts lives at apps/ingester/src/cli.ts, so the repo root is three levels up.
    // This makes the binary location-independent — the plan's `process.cwd(), '../..'`
    // only works when invoked from `apps/ingester/`.
    const __dirname = dirname(fileURLToPath(import.meta.url))
    const repoRoot = path.resolve(__dirname, '../../..')
    const results = await runSync({ repoRoot, force: opts.force, host: opts.host })
    for (const r of results) console.log(`  ${r.host}: ${r.kind}`)
    await closeDb()
  })

program.parseAsync().catch((e) => { console.error(e); process.exit(1) })
