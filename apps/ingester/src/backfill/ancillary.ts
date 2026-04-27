import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { sql } from 'drizzle-orm'
import {
  promptsHistory, todos as todosTable, fileSnapshots, shellSnapshots,
} from '@cca/db'
import type * as schema from '@cca/db/schema'
import {
  readHistory, readTodosDir, readFileHistoryDir, readShellSnapshotsDir,
} from '@cca/parsers'

type Db = PostgresJsDatabase<typeof schema>

export async function ingestHistory(db: Db, file: string | null, opts: { host: string }): Promise<number> {
  if (!file) return 0
  const batch: Array<typeof promptsHistory.$inferInsert> = []
  for await (const e of readHistory(file)) {
    batch.push({
      display: e.display,
      pastedContents: e.pastedContents as object,
      typedAt: e.typedAt,
      projectPath: e.projectPath,
      host: opts.host,
    })
  }
  if (batch.length === 0) return 0
  const res = await db
    .insert(promptsHistory)
    .values(batch)
    .onConflictDoNothing()
    .returning({ id: promptsHistory.id })
  return res.length
}

export async function ingestTodos(db: Db, dir: string | null, opts: { host: string }): Promise<number> {
  if (!dir) return 0
  const batch: Array<typeof todosTable.$inferInsert> = []
  for await (const t of readTodosDir(dir)) {
    batch.push({
      sessionId: t.sessionId, agentId: t.agentId,
      snapshotAt: t.snapshotAt, todos: t.todos as object,
      host: opts.host,
    })
  }
  if (batch.length === 0) return 0
  const res = await db.insert(todosTable).values(batch).onConflictDoNothing().returning({ sessionId: todosTable.sessionId })
  return res.length
}

export async function ingestFileHistory(db: Db, dir: string | null, opts: { host: string }): Promise<number> {
  if (!dir) return 0
  let count = 0
  const buf: Array<typeof fileSnapshots.$inferInsert> = []
  const flush = async () => {
    if (buf.length === 0) return
    await db.insert(fileSnapshots).values(buf).onConflictDoNothing()
    count += buf.length
    buf.length = 0
  }
  for await (const s of readFileHistoryDir(dir)) {
    buf.push({
      sessionId: s.sessionId, filePath: s.filePath, version: s.version,
      snapshotAt: s.snapshotAt, content: s.content, sha256: s.sha256,
      host: opts.host,
    })
    if (buf.length >= 200) await flush()
  }
  await flush()
  return count
}

export async function ingestShellSnapshots(db: Db, dir: string | null, opts: { host: string }): Promise<number> {
  if (!dir) return 0
  const batch: Array<typeof shellSnapshots.$inferInsert> = []
  for await (const s of readShellSnapshotsDir(dir)) {
    batch.push({ id: s.id, capturedAt: s.capturedAt, content: s.content, host: opts.host })
  }
  if (batch.length === 0) return 0
  const res = await db.insert(shellSnapshots).values(batch).onConflictDoNothing().returning({ id: shellSnapshots.id })
  return res.length
}

export async function refreshMaterializedViews(db: Db): Promise<void> {
  await db.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY usage_daily`)
}
