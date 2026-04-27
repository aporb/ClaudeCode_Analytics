import 'server-only'
import { sql } from 'drizzle-orm'
import { getDb } from '../db'

/**
 * Returns the union of distinct hosts seen in the events table plus the
 * implicit `'local'` host (always present, even before any remote sync).
 *
 * Used to populate the host filter chip in the nav. Sorted alphabetically,
 * with `'local'` guaranteed to appear at least once.
 */
export async function getAllHosts(): Promise<string[]> {
  const db = getDb()
  const rows = (await db.execute<{ host: string }>(sql`
    SELECT DISTINCT host FROM events
    UNION
    SELECT 'local' AS host
    ORDER BY host
  `)) as unknown as Array<{ host: string }>
  return rows.map((r) => r.host).filter(Boolean)
}

export interface HostStats {
  host: string
  sessionCount: number
  totalInputTokens: number
  totalOutputTokens: number
  totalCacheCreation: number
  totalCacheRead: number
  estimatedCostUsd: number
  topModel: string | null
  topModelCost: number
  lastActiveAt: Date | null
  lastPulledAt: Date | null
  consecutiveErrors: number
  lastError: string | null
}

/**
 * Per-host aggregation over the given window. One row per host that has at
 * least one session within the window. Joined to `host_sync_state` for
 * sync-health metadata (last pulled, consecutive errors, last error).
 *
 * Top model: derived by unnesting `models_used` and ranking by summed
 * `estimated_cost_usd` across sessions that used that model. When a session
 * lists multiple models, its full cost is attributed to each (we don't have
 * per-model cost on `sessions` itself), so the top-model cost is an
 * upper bound, not an exact share — sufficient for "what dominates this
 * host's spend" UX.
 */
export async function getHostStats(opts: {
  sinceStart: Date
  sinceEnd: Date
}): Promise<HostStats[]> {
  const db = getDb()
  const startTs = opts.sinceStart.toISOString()
  const endTs = opts.sinceEnd.toISOString()
  const rows = (await db.execute<{
    host: string
    session_count: number
    input_tokens: number
    output_tokens: number
    cache_creation: number
    cache_read: number
    cost: string
    top_model: string | null
    top_model_cost: string | null
    last_active_at: string | null
    last_pulled_at: string | null
    consecutive_errors: number
    last_error: string | null
  }>(sql`
    WITH sess AS (
      SELECT host,
        COUNT(*) AS session_count,
        COALESCE(SUM(total_input_tokens), 0)    AS input_tokens,
        COALESCE(SUM(total_output_tokens), 0)   AS output_tokens,
        COALESCE(SUM(total_cache_creation), 0)  AS cache_creation,
        COALESCE(SUM(total_cache_read), 0)      AS cache_read,
        COALESCE(SUM(estimated_cost_usd), 0)    AS cost,
        MAX(started_at) AS last_active_at
      FROM sessions
      WHERE started_at BETWEEN ${startTs}::timestamptz AND ${endTs}::timestamptz
      GROUP BY host
    ),
    top AS (
      SELECT DISTINCT ON (host) host, model AS top_model, top_model_cost
      FROM (
        SELECT host, model,
          SUM(estimated_cost_usd) OVER (PARTITION BY host, model) AS top_model_cost
        FROM sessions, unnest(COALESCE(models_used, ARRAY[]::text[])) AS model
        WHERE started_at BETWEEN ${startTs}::timestamptz AND ${endTs}::timestamptz
      ) t
      ORDER BY host, top_model_cost DESC NULLS LAST
    )
    SELECT
      sess.host, sess.session_count, sess.input_tokens, sess.output_tokens,
      sess.cache_creation, sess.cache_read, sess.cost::text AS cost,
      top.top_model, top.top_model_cost::text AS top_model_cost,
      sess.last_active_at::text AS last_active_at,
      hss.last_pulled_at::text AS last_pulled_at,
      COALESCE(hss.consecutive_errors, 0) AS consecutive_errors,
      hss.last_error
    FROM sess
    LEFT JOIN top USING (host)
    LEFT JOIN host_sync_state hss USING (host)
    ORDER BY sess.cost DESC
  `)) as unknown as Array<{
    host: string
    session_count: number
    input_tokens: number
    output_tokens: number
    cache_creation: number
    cache_read: number
    cost: string
    top_model: string | null
    top_model_cost: string | null
    last_active_at: string | null
    last_pulled_at: string | null
    consecutive_errors: number
    last_error: string | null
  }>
  return rows.map((r) => ({
    host: r.host,
    sessionCount: Number(r.session_count),
    totalInputTokens: Number(r.input_tokens),
    totalOutputTokens: Number(r.output_tokens),
    totalCacheCreation: Number(r.cache_creation),
    totalCacheRead: Number(r.cache_read),
    estimatedCostUsd: Number(r.cost),
    topModel: r.top_model,
    topModelCost: Number(r.top_model_cost ?? 0),
    lastActiveAt: r.last_active_at ? new Date(r.last_active_at) : null,
    lastPulledAt: r.last_pulled_at ? new Date(r.last_pulled_at) : null,
    consecutiveErrors: Number(r.consecutive_errors),
    lastError: r.last_error,
  }))
}
