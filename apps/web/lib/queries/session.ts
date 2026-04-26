import 'server-only'
import { getDb } from '../db'
import { sessions, events, toolCalls } from '@cca/db/schema'
import { asc, eq, sql } from 'drizzle-orm'

export async function getSessionMeta(sessionId: string) {
  const db = getDb()
  const [row] = await db.select().from(sessions).where(eq(sessions.sessionId, sessionId)).limit(1)
  return row ?? null
}

export async function getSessionEvents(sessionId: string) {
  const db = getDb()
  return db.select().from(events).where(eq(events.sessionId, sessionId)).orderBy(asc(events.timestamp))
}

export async function getSessionToolCalls(sessionId: string) {
  const db = getDb()
  return db.select().from(toolCalls).where(eq(toolCalls.sessionId, sessionId)).orderBy(asc(toolCalls.timestamp))
}

export async function getSessionStats(sessionId: string) {
  const db = getDb()
  const rows = await db.execute<{
    cache_read: string
    input_tokens: string
    output_tokens: string
    cache_create: string
    cost_by_model: { model: string; cost: number }[]
  }>(sql`
    WITH per_model AS (
      SELECT m.model,
             SUM(m.input_tokens)::bigint AS in_tok,
             SUM(m.output_tokens)::bigint AS out_tok,
             SUM(m.cache_read_tokens)::bigint AS cache_read,
             SUM(m.cache_creation_tokens)::bigint AS cache_create,
             COALESCE(SUM(
               m.input_tokens * mp.input_per_mtok / 1e6
             + m.output_tokens * mp.output_per_mtok / 1e6
             + m.cache_creation_tokens * mp.cache_write_5m_per_mtok / 1e6
             + m.cache_read_tokens * mp.cache_read_per_mtok / 1e6
             ), 0) AS cost
      FROM messages m
      LEFT JOIN model_pricing mp ON mp.model = m.model
      WHERE m.session_id = ${sessionId} AND m.role = 'assistant' AND m.model IS NOT NULL
      GROUP BY m.model
    )
    SELECT
      COALESCE(SUM(cache_read), 0)::bigint AS cache_read,
      COALESCE(SUM(in_tok), 0)::bigint AS input_tokens,
      COALESCE(SUM(out_tok), 0)::bigint AS output_tokens,
      COALESCE(SUM(cache_create), 0)::bigint AS cache_create,
      COALESCE(json_agg(json_build_object('model', model, 'cost', cost) ORDER BY cost DESC), '[]'::json) AS cost_by_model
    FROM per_model
  `)
  const row = (rows as unknown as Array<{
    cache_read: string; input_tokens: string; output_tokens: string; cache_create: string
    cost_by_model: { model: string; cost: number }[]
  }>)[0]
  const inTok = Number(row?.input_tokens ?? 0)
  const cacheRead = Number(row?.cache_read ?? 0)
  return {
    inputTokens: inTok,
    outputTokens: Number(row?.output_tokens ?? 0),
    cacheReadTokens: cacheRead,
    cacheCreateTokens: Number(row?.cache_create ?? 0),
    cacheHitPct: inTok + cacheRead > 0 ? cacheRead / (inTok + cacheRead) : 0,
    costByModel: (row?.cost_by_model ?? []).map((c) => ({ model: c.model, cost: Number(c.cost) })),
  }
}

export async function getSessionTopTools(sessionId: string, limit = 5) {
  const db = getDb()
  const rows = await db.execute<{ tool_name: string; calls: string; errors: string }>(sql`
    SELECT tool_name,
           COUNT(*)::int AS calls,
           COUNT(*) FILTER (WHERE is_error)::int AS errors
    FROM tool_calls
    WHERE session_id = ${sessionId}
    GROUP BY tool_name
    ORDER BY calls DESC
    LIMIT ${limit}
  `)
  return (rows as unknown as Array<{ tool_name: string; calls: string; errors: string }>).map((r) => ({
    tool: r.tool_name, calls: Number(r.calls), errors: Number(r.errors),
  }))
}

export async function getSessionFilesTouched(sessionId: string, limit = 5) {
  const db = getDb()
  const rows = await db.execute<{ file: string; n: string }>(sql`
    SELECT input->>'file_path' AS file, COUNT(*)::int AS n
    FROM tool_calls
    WHERE session_id = ${sessionId}
      AND tool_name IN ('Read', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit')
      AND input->>'file_path' IS NOT NULL
    GROUP BY input->>'file_path'
    ORDER BY n DESC
    LIMIT ${limit}
  `)
  const all = await db.execute<{ total: string }>(sql`
    SELECT COUNT(DISTINCT input->>'file_path')::int AS total
    FROM tool_calls
    WHERE session_id = ${sessionId}
      AND tool_name IN ('Read', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit')
      AND input->>'file_path' IS NOT NULL
  `)
  const total = Number(((all as unknown as Array<{ total: string }>)[0])?.total ?? 0)
  const top = (rows as unknown as Array<{ file: string; n: string }>).map((r) => ({ file: r.file, n: Number(r.n) }))
  return { top, total }
}

export async function getSessionFirstPrompts(sessionId: string, limit = 3) {
  const db = getDb()
  const rows = await db.execute<{ ts: string; text: string }>(sql`
    SELECT timestamp::text AS ts, text_content AS text
    FROM messages
    WHERE session_id = ${sessionId}
      AND role = 'user'
      AND is_sidechain = false
      AND text_content IS NOT NULL
    ORDER BY timestamp ASC
    LIMIT ${limit}
  `)
  return (rows as unknown as Array<{ ts: string; text: string }>).map((r) => ({
    ts: new Date(r.ts).toISOString(),
    text: r.text.slice(0, 140),
  }))
}
