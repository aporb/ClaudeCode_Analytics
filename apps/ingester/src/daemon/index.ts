import { getDb, closeDb } from '@cca/db'
import { Broadcaster } from './broadcaster.js'
import { startTailer } from './tailer.js'
import { startServer } from './server.js'
import pc from 'picocolors'

export interface DaemonOptions {
  claudeHome: string
  port?: number
}

export interface Daemon {
  stop: () => Promise<void>
}

export async function startDaemon(opts: DaemonOptions): Promise<Daemon> {
  const db = getDb()
  const broadcaster = new Broadcaster()
  const startedAt = Date.now()
  const port = opts.port ?? 9939

  console.log(pc.dim(`[cca daemon] starting at ${new Date(startedAt).toISOString()}`))
  console.log(pc.dim(`[cca daemon] watching ${opts.claudeHome}`))
  console.log(pc.dim(`[cca daemon] http on http://localhost:${port}`))

  const tailer = await startTailer({ claudeHome: opts.claudeHome, db, broadcaster })
  const server = await startServer({ port, db, broadcaster, startedAt })

  const shutdown = async () => {
    console.log(pc.dim('[cca daemon] shutting down...'))
    await tailer.stop()
    await server.stop()
    await closeDb()
  }

  process.on('SIGINT', async () => { await shutdown(); process.exit(0) })
  process.on('SIGTERM', async () => { await shutdown(); process.exit(0) })

  console.log(pc.green('[cca daemon] ready'))
  return { stop: shutdown }
}
