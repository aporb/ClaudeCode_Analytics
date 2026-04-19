import 'server-only'
import { getDb } from './db'
import { sessions, events } from '@cca/db/schema'
import { and, asc, desc, eq, gte, ilike, sql } from 'drizzle-orm'

export interface SessionsQuery {
  project?: string
  since?: Date
  model?: string
  limit?: number
  offset?: number
}

export async function listSessions(q: SessionsQuery) {
  const db = getDb()
  const conditions = []
  if (q.project) conditions.push(ilike(sessions.projectPath, `%${q.project}%`))
  if (q.since) conditions.push(gte(sessions.startedAt, q.since))
  if (q.model) conditions.push(sql`${q.model} = ANY(${sessions.modelsUsed})`)

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
    .orderBy(desc(sessions.startedAt))
    .limit(q.limit ?? 25)
    .offset(q.offset ?? 0)
}

export async function getSessionEvents(sessionId: string) {
  const db = getDb()
  return db.select().from(events).where(eq(events.sessionId, sessionId)).orderBy(asc(events.timestamp))
}

export async function getSessionMeta(sessionId: string) {
  const db = getDb()
  const [row] = await db.select().from(sessions).where(eq(sessions.sessionId, sessionId)).limit(1)
  return row ?? null
}
