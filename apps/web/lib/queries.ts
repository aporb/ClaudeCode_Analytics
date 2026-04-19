import 'server-only'
import { getDb } from './db'
import { sessions, events, toolCalls } from '@cca/db/schema'
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

export async function getSessionToolCalls(sessionId: string) {
  const db = getDb()
  return db.select().from(toolCalls).where(eq(toolCalls.sessionId, sessionId)).orderBy(asc(toolCalls.timestamp))
}

export async function getSessionMeta(sessionId: string) {
  const db = getDb()
  const [row] = await db.select().from(sessions).where(eq(sessions.sessionId, sessionId)).limit(1)
  return row ?? null
}

export async function getTokensPerDay(days: number) {
  const db = getDb()
  const rows = await db.execute<{ day: Date; input_tokens: number; output_tokens: number }>(sql`
    SELECT
      day::date AS day,
      SUM(input_tokens)::bigint AS input_tokens,
      SUM(output_tokens)::bigint AS output_tokens
    FROM usage_daily
    WHERE day >= now() - make_interval(days => ${days}::int)
    GROUP BY day ORDER BY day ASC
  `)
  return (rows as unknown as Array<{ day: Date; input_tokens: number; output_tokens: number }>).map((r) => ({
    day: new Date(r.day).toISOString().slice(0, 10),
    input: Number(r.input_tokens),
    output: Number(r.output_tokens),
  }))
}

export async function getTopTools(days: number) {
  const db = getDb()
  const rows = await db.execute<{ tool_name: string; calls: number; errors: number }>(sql`
    SELECT tool_name, COUNT(*) AS calls, COUNT(*) FILTER (WHERE is_error) AS errors
    FROM tool_calls
    WHERE timestamp >= now() - make_interval(days => ${days}::int)
    GROUP BY tool_name ORDER BY calls DESC LIMIT 10
  `)
  return (rows as unknown as Array<{ tool_name: string; calls: number; errors: number }>).map((r) => ({
    tool: r.tool_name,
    calls: Number(r.calls),
    errors: Number(r.errors),
    errorRate: Number(r.calls) > 0 ? (Number(r.errors) / Number(r.calls)) * 100 : 0,
  }))
}

export async function getActivityByDay(days: number) {
  const db = getDb()
  const rows = await db.execute<{ day: Date; sessions: number }>(sql`
    SELECT date_trunc('day', started_at)::date AS day, COUNT(*) AS sessions
    FROM sessions
    WHERE started_at >= now() - make_interval(days => ${days}::int)
    GROUP BY 1 ORDER BY 1 ASC
  `)
  return (rows as unknown as Array<{ day: Date; sessions: number }>).map((r) => ({
    day: new Date(r.day).toISOString().slice(0, 10),
    sessions: Number(r.sessions),
  }))
}

export async function getCostByProject(days: number) {
  const db = getDb()
  const rows = await db.execute<{ project_path: string | null; cost: string }>(sql`
    SELECT project_path, SUM(estimated_cost_usd)::numeric(10,2) AS cost
    FROM sessions
    WHERE started_at >= now() - make_interval(days => ${days}::int)
      AND project_path IS NOT NULL AND estimated_cost_usd IS NOT NULL
    GROUP BY project_path ORDER BY cost DESC NULLS LAST LIMIT 10
  `)
  return (rows as unknown as Array<{ project_path: string | null; cost: string }>).map((r) => ({
    project: (r.project_path ?? '(none)').replace(/^\/Users\/[^/]+\//, '~/'),
    cost: Number(r.cost),
  }))
}
