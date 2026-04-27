import { config } from 'dotenv'
import { resolve } from 'node:path'
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

program.parseAsync().catch((e) => { console.error(e); process.exit(1) })
