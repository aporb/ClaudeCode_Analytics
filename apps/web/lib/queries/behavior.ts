import 'server-only'
import { getDb } from '../db'
import { sql } from 'drizzle-orm'

interface Window { start: Date; end: Date }

/** ISO timestamp string for postgres.js (prepare:false mode doesn't accept Date objects) */
function ts(d: Date): string { return d.toISOString() }

export async function getToolErrorRateTrend(w: Window) {
  const db = getDb()
  const wStart = ts(w.start); const wEnd = ts(w.end)
  const rows = await db.execute<{ day: string; calls: string; errors: string }>(sql`
    SELECT date_trunc('day', timestamp)::date::text AS day,
           COUNT(*)::int AS calls,
           COUNT(*) FILTER (WHERE is_error)::int AS errors
    FROM tool_calls
    WHERE timestamp >= ${wStart}::timestamptz AND timestamp <= ${wEnd}::timestamptz
    GROUP BY 1 ORDER BY 1 ASC
  `) as unknown as Array<{ day: string; calls: string; errors: string }>
  return rows.map((r) => ({
    day: r.day.slice(0, 10),
    calls: Number(r.calls),
    errors: Number(r.errors),
    errorRate: Number(r.calls) > 0 ? Number(r.errors) / Number(r.calls) : 0,
  }))
}

export async function getLatencyPercentiles(w: Window) {
  const db = getDb()
  const wStart = ts(w.start); const wEnd = ts(w.end)
  const rows = await db.execute<{ day: string; p50: string; p95: string }>(sql`
    WITH pairs AS (
      SELECT
        date_trunc('day', timestamp)::date AS day,
        EXTRACT(EPOCH FROM (
          LEAD(timestamp) OVER (PARTITION BY session_id ORDER BY timestamp) - timestamp
        )) AS gap,
        role,
        LEAD(role) OVER (PARTITION BY session_id ORDER BY timestamp) AS next_role
      FROM messages
      WHERE timestamp >= ${wStart}::timestamptz AND timestamp <= ${wEnd}::timestamptz
        AND is_sidechain = false
    )
    SELECT day::text, percentile_cont(0.5) WITHIN GROUP (ORDER BY gap)::float8::text AS p50,
           percentile_cont(0.95) WITHIN GROUP (ORDER BY gap)::float8::text AS p95
    FROM pairs
    WHERE role = 'user' AND next_role = 'assistant' AND gap IS NOT NULL AND gap < 600
    GROUP BY day ORDER BY day ASC
  `) as unknown as Array<{ day: string; p50: string; p95: string }>
  return rows.map((r) => ({ day: r.day.slice(0, 10), p50Sec: Number(r.p50), p95Sec: Number(r.p95) }))
}

export async function getSubagentHistogram(w: Window) {
  const db = getDb()
  const wStart = ts(w.start); const wEnd = ts(w.end)
  const rows = await db.execute<{ bucket: string; n: string }>(sql`
    SELECT LEAST(subagent_count, 6)::int AS bucket, COUNT(*)::int AS n
    FROM sessions
    WHERE started_at >= ${wStart}::timestamptz AND started_at <= ${wEnd}::timestamptz AND subagent_count IS NOT NULL
    GROUP BY 1 ORDER BY 1 ASC
  `) as unknown as Array<{ bucket: string; n: string }>
  return rows.map((r) => ({ bucket: Number(r.bucket), count: Number(r.n) }))
}

export async function getTokenVelocity(w: Window) {
  const db = getDb()
  const wStart = ts(w.start); const wEnd = ts(w.end)
  const rows = await db.execute<{ session_id: string; started_at: string; vel: string; cost: string | null }>(sql`
    SELECT session_id, started_at::text,
           CASE WHEN duration_sec > 0
                THEN ((total_input_tokens + total_output_tokens)::float8 / duration_sec)
                ELSE 0 END::float8::text AS vel,
           estimated_cost_usd::float8::text AS cost
    FROM sessions
    WHERE started_at >= ${wStart}::timestamptz AND started_at <= ${wEnd}::timestamptz
      AND duration_sec IS NOT NULL AND duration_sec > 0
    ORDER BY started_at ASC
  `) as unknown as Array<{ session_id: string; started_at: string; vel: string; cost: string | null }>
  return rows.map((r) => ({
    sessionId: r.session_id,
    startedAt: new Date(r.started_at).toISOString(),
    tokensPerSec: Number(r.vel),
    cost: r.cost ? Number(r.cost) : null,
  }))
}

export async function getCacheHitByModel(w: Window) {
  const db = getDb()
  const wStart = ts(w.start); const wEnd = ts(w.end)
  const rows = await db.execute<{ model: string | null; hit: string }>(sql`
    SELECT model,
           CASE WHEN SUM(input_tokens + cache_read_tokens) > 0
                THEN SUM(cache_read_tokens)::float8 / SUM(input_tokens + cache_read_tokens)::float8
                ELSE 0 END::float8::text AS hit
    FROM messages
    WHERE timestamp >= ${wStart}::timestamptz AND timestamp <= ${wEnd}::timestamptz
      AND role = 'assistant' AND model IS NOT NULL
    GROUP BY model ORDER BY hit DESC
  `) as unknown as Array<{ model: string | null; hit: string }>
  return rows.map((r) => ({ model: r.model ?? '(none)', hitPct: Number(r.hit) }))
}
