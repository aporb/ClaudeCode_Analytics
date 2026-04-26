import 'server-only'
import { getDb } from '../db'
import { sessions } from '@cca/db/schema'
import { and, desc, gte, ilike, lte, sql } from 'drizzle-orm'

export interface SessionsQuery {
  project?: string
  since?: { start: Date; end: Date }
  models?: string[]
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
    conditions.push(sql`${sessions.modelsUsed} && ${sql.raw(`ARRAY[${q.models.map((m) => `'${m}'`).join(',')}]::text[]`)}`)
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
    })
    .from(sessions)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(order)
    .limit(q.limit ?? 50)
    .offset(q.offset ?? 0)
}

export async function countSessions(q: Pick<SessionsQuery, 'project' | 'since' | 'models'>): Promise<number> {
  const db = getDb()
  const conditions = []
  if (q.project) conditions.push(ilike(sessions.projectPath, `%${q.project}%`))
  if (q.since) {
    conditions.push(gte(sessions.startedAt, q.since.start))
    conditions.push(lte(sessions.startedAt, q.since.end))
  }
  if (q.models?.length) {
    conditions.push(sql`${sessions.modelsUsed} && ${sql.raw(`ARRAY[${q.models.map((m) => `'${m}'`).join(',')}]::text[]`)}`)
  }
  const [row] = await db
    .select({ c: sql<number>`COUNT(*)::int` })
    .from(sessions)
    .where(conditions.length ? and(...conditions) : undefined)
  return row?.c ?? 0
}
