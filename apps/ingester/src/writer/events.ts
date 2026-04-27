import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { events } from '@cca/db'
import type * as schema from '@cca/db/schema'
import type { ParsedEvent } from '@cca/core'

type Db = PostgresJsDatabase<typeof schema>

export async function insertEventsBatch(
  db: Db,
  batch: ParsedEvent[],
  opts: { host: string },
): Promise<number> {
  if (batch.length === 0) return 0
  const rows = batch.map((e) => ({
    uuid: e.uuid,
    sessionId: e.sessionId,
    parentUuid: e.parentUuid ?? null,
    type: e.type,
    subtype: e.subtype ?? null,
    timestamp: e.timestamp,
    cwd: e.cwd ?? null,
    projectPath: e.projectPath ?? null,
    gitBranch: e.gitBranch ?? null,
    ccVersion: e.ccVersion ?? null,
    entrypoint: e.entrypoint ?? null,
    isSidechain: e.isSidechain,
    agentId: e.agentId ?? null,
    requestId: e.requestId ?? null,
    payload: e.payload as object,
    sourceFile: e.sourceFile,
    host: opts.host,
  }))
  const result = await db
    .insert(events)
    .values(rows)
    .onConflictDoNothing({ target: events.uuid })
    .returning({ uuid: events.uuid })
  return result.length
}
