import 'server-only'
import { getDb } from '../db'
import { sessions } from '@cca/db/schema'
import { and, desc, gte, ilike, lte, sql } from 'drizzle-orm'

/** Build a Postgres ARRAY[…]::text[] SQL chunk from a JS string array. */
export function pgTextArray(values: string[]) {
  return sql`ARRAY[${sql.join(values.map((v) => sql`${v}`), sql`, `)}]::text[]`
}

export interface SessionsQuery {
  project?: string
  since?: { start: Date; end: Date }
  models?: string[]
  /** Host filter: null/undefined = all hosts; non-empty array = restrict to those hosts. */
  hosts?: string[] | null
  sortBy?: 'recent' | 'cost'
  limit?: number
  offset?: number
}

export async function listSessions(q: SessionsQuery) {
  const db = getDb()
  const conditions = []
  if (q.project) conditions.push(ilike(sessions.projectPath, `%${q.project}%`))
  if (q.since) {
    conditions.push(gte(sessions.startedAt, q.since.start))
    conditions.push(lte(sessions.startedAt, q.since.end))
  }
  if (q.models?.length) {
    conditions.push(sql`${sessions.modelsUsed} && ${pgTextArray(q.models)}`)
  }
  if (q.hosts && q.hosts.length > 0) {
    conditions.push(sql`${sessions.host} = ANY(${pgTextArray(q.hosts)})`)
  }
  const order = q.sortBy === 'cost' ? sql`${sessions.estimatedCostUsd} DESC NULLS LAST` : desc(sessions.startedAt)
  return db
    .select({
      sessionId: sessions.sessionId,
      projectPath: sessions.projectPath,
      startedAt: sessions.startedAt,
      durationSec: sessions.durationSec,
      messageCount: sessions.messageCount,
      toolCallCount: sessions.toolCallCount,
      cost: sessions.estimatedCostUsd,
      firstPrompt: sessions.firstUserPrompt,
      status: sessions.status,
      modelsUsed: sessions.modelsUsed,
      host: sessions.host,
    })
    .from(sessions)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(order)
    .limit(q.limit ?? 50)
    .offset(q.offset ?? 0)
}

export async function countSessions(q: Pick<SessionsQuery, 'project' | 'since' | 'models' | 'hosts'>): Promise<number> {
  const db = getDb()
  const conditions = []
  if (q.project) conditions.push(ilike(sessions.projectPath, `%${q.project}%`))
  if (q.since) {
    conditions.push(gte(sessions.startedAt, q.since.start))
    conditions.push(lte(sessions.startedAt, q.since.end))
  }
  if (q.models?.length) {
    conditions.push(sql`${sessions.modelsUsed} && ${pgTextArray(q.models)}`)
  }
  if (q.hosts && q.hosts.length > 0) {
    conditions.push(sql`${sessions.host} = ANY(${pgTextArray(q.hosts)})`)
  }
  const [row] = await db
    .select({ c: sql<number>`COUNT(*)::int` })
    .from(sessions)
    .where(conditions.length ? and(...conditions) : undefined)
  return row?.c ?? 0
}
