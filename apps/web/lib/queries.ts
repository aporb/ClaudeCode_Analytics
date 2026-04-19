import 'server-only'
import { getDb } from './db'
import { sessions } from '@cca/db/schema'
import { and, desc, gte, ilike, sql } from 'drizzle-orm'

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
