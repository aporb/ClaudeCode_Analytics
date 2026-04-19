import { statSync } from 'node:fs'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { eq, sql } from 'drizzle-orm'
import { readTranscript } from '@cca/parsers'
import type { ParsedEvent } from '@cca/core'
import { ingestCursors } from '@cca/db'
import type * as schema from '@cca/db/schema'
import { insertEventsBatch } from '../writer/events.js'
import { deriveMessagesFromEvents } from '../writer/deriveMessages.js'
import { deriveToolCallsFromEvents } from '../writer/deriveToolCalls.js'
import { rollupSessions } from '../writer/deriveSessions.js'
import type { Broadcaster } from './broadcaster.js'

type Db = PostgresJsDatabase<typeof schema>

export interface DeltaResult {
  newEvents: number
  sessionIds: Set<string>
  fromOffset: number
  toOffset: number
}

export async function ingestFileDelta(
  db: Db,
  file: string,
  broadcaster: Broadcaster,
): Promise<DeltaResult> {
  const existing = await db
    .select({ byteOffset: ingestCursors.byteOffset })
    .from(ingestCursors)
    .where(eq(ingestCursors.sourceFile, file))
    .limit(1)
  const fromOffset = existing[0]?.byteOffset ?? 0
  const fileSize = statSync(file).size
  if (fileSize <= fromOffset) {
    return { newEvents: 0, sessionIds: new Set(), fromOffset, toOffset: fromOffset }
  }

  const batch: ParsedEvent[] = []
  const sessionIds = new Set<string>()
  for await (const e of readTranscript(file)) {
    batch.push(e)
    sessionIds.add(e.sessionId)
  }

  const inserted = await insertEventsBatch(db, batch)
  if (inserted > 0) {
    await deriveMessagesFromEvents(db, batch)
    await deriveToolCallsFromEvents(db, batch)
    await rollupSessions(db, [...sessionIds])
    for (const e of batch) broadcaster.publish({
      kind: 'event',
      payload: { uuid: e.uuid, sessionId: e.sessionId, type: e.type, subtype: e.subtype, timestamp: e.timestamp },
    })
  }

  await db
    .insert(ingestCursors)
    .values({ sourceFile: file, byteOffset: fileSize })
    .onConflictDoUpdate({
      target: ingestCursors.sourceFile,
      set: { byteOffset: fileSize, updatedAt: sql`now()` },
    })

  return { newEvents: inserted, sessionIds, fromOffset, toOffset: fileSize }
}
