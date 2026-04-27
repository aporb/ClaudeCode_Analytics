import { SingleBar, Presets } from 'cli-progress'
import { statSync } from 'node:fs'
import pLimit from 'p-limit'
import pc from 'picocolors'

import { getDb, ingestCursors } from '@cca/db'
import { sql } from 'drizzle-orm'
import { readTranscript } from '@cca/parsers'
import type { ParsedEvent } from '@cca/core'

import { enumerateSources } from './enumerate.js'
import {
  ingestHistory, ingestTodos, ingestFileHistory, ingestShellSnapshots, refreshMaterializedViews,
} from './ancillary.js'
import { insertEventsBatch } from '../writer/events.js'
import { deriveMessagesFromEvents } from '../writer/deriveMessages.js'
import { deriveToolCallsFromEvents } from '../writer/deriveToolCalls.js'
import { rollupSessions } from '../writer/deriveSessions.js'

const BATCH_SIZE = 1000

async function ingestTranscriptFile(db: ReturnType<typeof getDb>, file: string): Promise<{ events: number; sessions: Set<string> }> {
  const sessions = new Set<string>()
  let events = 0
  let buf: ParsedEvent[] = []
  const flush = async () => {
    if (buf.length === 0) return
    const n = await insertEventsBatch(db, buf, { host: 'local' })
    await deriveMessagesFromEvents(db, buf, { host: 'local' })
    await deriveToolCallsFromEvents(db, buf)
    events += n
    buf = []
  }
  for await (const e of readTranscript(file)) {
    sessions.add(e.sessionId)
    buf.push(e)
    if (buf.length >= BATCH_SIZE) await flush()
  }
  await flush()
  // Persist cursor at EOF
  const size = statSync(file).size
  await db
    .insert(ingestCursors)
    .values({ sourceFile: file, byteOffset: size })
    .onConflictDoUpdate({
      target: ingestCursors.sourceFile,
      set: { byteOffset: size, updatedAt: sql`now()` },
    })
  return { events, sessions }
}

export async function backfillAll(claudeHome: string, opts: { concurrency?: number } = {}): Promise<void> {
  const db = getDb()
  const sources = enumerateSources(claudeHome)
  console.log(pc.dim(`found ${sources.transcripts.length} transcript files`))

  const bar = new SingleBar({
    format: `${pc.cyan('{bar}')} {percentage}% | {value}/{total} files | events: {events} | sessions: {sessions}`,
  }, Presets.shades_classic)
  bar.start(sources.transcripts.length, 0, { events: 0, sessions: 0 })

  const limit = pLimit(opts.concurrency ?? 6)
  const allSessions = new Set<string>()
  let totalEvents = 0
  let done = 0

  await Promise.all(
    sources.transcripts.map((f) => limit(async () => {
      try {
        const { events, sessions } = await ingestTranscriptFile(db, f)
        totalEvents += events
        for (const s of sessions) allSessions.add(s)
      } catch (e) {
        console.error(pc.red(`\nfailed ${f}: ${(e as Error).message}`))
      } finally {
        done += 1
        bar.update(done, { events: totalEvents, sessions: allSessions.size })
      }
    })),
  )
  bar.stop()

  console.log(pc.dim('rolling up sessions...'))
  const chunks = chunk([...allSessions], 500)
  for (const c of chunks) await rollupSessions(db, c)

  console.log(pc.dim('ingesting ancillary streams...'))
  const h = await ingestHistory(db, sources.history)
  const t = await ingestTodos(db, sources.todosDir)
  const fh = await ingestFileHistory(db, sources.fileHistoryDir)
  const ss = await ingestShellSnapshots(db, sources.shellSnapshotsDir)
  console.log(pc.dim(`  history: ${h}, todos: ${t}, file snapshots: ${fh}, shell: ${ss}`))

  console.log(pc.dim('refreshing materialized views...'))
  try { await refreshMaterializedViews(db) } catch {
    // CONCURRENTLY requires the view to be populated once; do a non-concurrent refresh first
    try { await db.execute(sql`REFRESH MATERIALIZED VIEW usage_daily`) } catch {
      // View may not exist in test/minimal environments — skip silently
    }
  }

  console.log(pc.green(`\n✓ backfill complete: ${totalEvents} events across ${allSessions.size} sessions`))
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}
