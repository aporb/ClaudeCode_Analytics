import { realpathSync } from 'node:fs'
import { join } from 'node:path'
import type * as schema from '@cca/db/schema'
import chokidar, { type FSWatcher } from 'chokidar'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type { Broadcaster } from './broadcaster.js'
import { ingestFileDelta } from './liveIngest.js'

type Db = PostgresJsDatabase<typeof schema>

export interface TailerOptions {
  claudeHome: string
  db: Db
  broadcaster: Broadcaster
  debounceMs?: number
}

export interface Tailer {
  stop: () => Promise<void>
}

export async function startTailer(opts: TailerOptions): Promise<Tailer> {
  const debounceMs = opts.debounceMs ?? 200
  const pending = new Map<string, NodeJS.Timeout>()
  const claudeHome = realpathSync(opts.claudeHome)

  const watcher: FSWatcher = chokidar.watch(join(claudeHome, 'projects'), {
    ignoreInitial: false,
    awaitWriteFinish: false,
    persistent: true,
    usePolling: false,
    depth: 99,
  })

  const handle = (file: string) => {
    if (!file.endsWith('.jsonl')) return
    const existing = pending.get(file)
    if (existing) clearTimeout(existing)
    pending.set(
      file,
      setTimeout(async () => {
        pending.delete(file)
        try {
          await ingestFileDelta(opts.db, file, opts.broadcaster)
        } catch (e) {
          console.error(`tailer: failed to ingest ${file}: ${(e as Error).message}`)
        }
      }, debounceMs),
    )
  }

  watcher.on('add', handle)
  watcher.on('change', handle)
  watcher.on('error', (e) => console.error('tailer error:', e))

  await new Promise<void>((resolve) => watcher.once('ready', resolve))

  return {
    async stop() {
      for (const t of pending.values()) clearTimeout(t)
      pending.clear()
      await watcher.close()
    },
  }
}
