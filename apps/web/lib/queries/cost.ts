import 'server-only'
import { getDb } from '../db'
import { sql } from 'drizzle-orm'

/** Build a Postgres ARRAY[…]::text[] SQL chunk from a JS string array.
 *  Mirrors the working pattern from `apps/web/lib/queries/sessions.ts`
 *  (see STATUS: "fix(web): serialize model filter arrays as Postgres ARRAY[…]::text[]"). */
function pgTextArray(values: string[]) {
  return sql`ARRAY[${sql.join(values.map((v) => sql`${v}`), sql`, `)}]::text[]`
}

export interface Window { start: Date; end: Date }

export interface TokenTotals {
  input: number
  output: number
  cacheCreation: number
  cacheRead: number
  total: number
}

/**
 * Sum total tokens (input/output/cache create/cache read) across sessions in
 * the given window, optionally filtered to a list of hosts. Used for the
 * token headline on `/`.
 *
 * `hosts: null` means "all hosts" (no filter). An empty array is treated the
 * same as null (no filter) — the UI never sends an explicit empty array, but
 * we guard against it to avoid `host = ANY(ARRAY[]::text[])` which matches
 * nothing.
 */
export async function getTokenTotals(opts: {
  sinceStart: Date
  sinceEnd: Date
  hosts: string[] | null
}): Promise<TokenTotals> {
  const db = getDb()
  const startTs = opts.sinceStart.toISOString()
  const endTs = opts.sinceEnd.toISOString()
  const hostFilter = opts.hosts && opts.hosts.length > 0
    ? sql`AND host = ANY(${pgTextArray(opts.hosts)})`
    : sql``
  const rows = (await db.execute<{ input: string; output: string; cc: string; cr: string }>(sql`
    SELECT
      COALESCE(SUM(total_input_tokens), 0)::bigint    AS input,
      COALESCE(SUM(total_output_tokens), 0)::bigint   AS output,
      COALESCE(SUM(total_cache_creation), 0)::bigint  AS cc,
      COALESCE(SUM(total_cache_read), 0)::bigint      AS cr
    FROM sessions
    WHERE started_at BETWEEN ${startTs}::timestamptz AND ${endTs}::timestamptz ${hostFilter}
  `)) as unknown as Array<{ input: string; output: string; cc: string; cr: string }>
  const r = rows[0] ?? { input: '0', output: '0', cc: '0', cr: '0' }
  const input = Number(r.input)
  const output = Number(r.output)
  const cc = Number(r.cc)
  const cr = Number(r.cr)
  return { input, output, cacheCreation: cc, cacheRead: cr, total: input + output + cc + cr }
}

export interface CostKpis {
  todayCost: number
  windowCost: number
  windowCostPriorPeriod: number
  cacheHitPct: number
  cacheHitPctPrior: number
  topModel: { model: string; pctOfCost: number } | null
  topModelPctPrior: number
  activeSessions: { count: number; sample: { sessionId: string; projectPath: string | null }[] }
}

function priorWindow(w: Window): Window {
  const len = w.end.getTime() - w.start.getTime()
  return { start: new Date(w.start.getTime() - len), end: w.start }
}

/** ISO timestamp string for use in sql template literals */
function ts(d: Date): string { return d.toISOString() }
/** ISO date string (YYYY-MM-DD) for use in sql template literals */
function ds(d: Date): string { return d.toISOString().slice(0, 10) }

export async function getCostKpis(w: Window): Promise<CostKpis> {
  const db = getDb()
  const prior = priorWindow(w)
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)

  const todayStr = ts(todayStart)
  const wStart = ts(w.start); const wEnd = ts(w.end)
  const pStart = ts(prior.start); const pEnd = ts(prior.end)

  const costRows = await db.execute<{ today: string; window: string; window_prior: string }>(sql`
    SELECT
      COALESCE(SUM(estimated_cost_usd) FILTER (WHERE started_at >= ${todayStr}::timestamptz), 0)::float8 AS today,
      COALESCE(SUM(estimated_cost_usd) FILTER (WHERE started_at >= ${wStart}::timestamptz AND started_at <= ${wEnd}::timestamptz), 0)::float8 AS window,
      COALESCE(SUM(estimated_cost_usd) FILTER (WHERE started_at >= ${pStart}::timestamptz AND started_at <= ${pEnd}::timestamptz), 0)::float8 AS window_prior
    FROM sessions
  `) as unknown as Array<{ today: string; window: string; window_prior: string }>
  const cost = costRows[0]

  const wDayStart = ds(w.start); const wDayEnd = ds(w.end)
  const pDayStart = ds(prior.start); const pDayEnd = ds(prior.end)

  const cacheRows = await db.execute<{ in_tok: string; cache: string; in_tok_prior: string; cache_prior: string }>(sql`
    SELECT
      COALESCE(SUM(input_tokens) FILTER (WHERE day::date >= ${wDayStart}::date AND day::date <= ${wDayEnd}::date), 0)::bigint AS in_tok,
      COALESCE(SUM(cache_read) FILTER (WHERE day::date >= ${wDayStart}::date AND day::date <= ${wDayEnd}::date), 0)::bigint AS cache,
      COALESCE(SUM(input_tokens) FILTER (WHERE day::date >= ${pDayStart}::date AND day::date <= ${pDayEnd}::date), 0)::bigint AS in_tok_prior,
      COALESCE(SUM(cache_read) FILTER (WHERE day::date >= ${pDayStart}::date AND day::date <= ${pDayEnd}::date), 0)::bigint AS cache_prior
    FROM usage_daily
  `) as unknown as Array<{ in_tok: string; cache: string; in_tok_prior: string; cache_prior: string }>
  const cacheRow = cacheRows[0]

  const inTok = Number(cacheRow?.in_tok ?? 0); const cacheTok = Number(cacheRow?.cache ?? 0)
  const inTokPrior = Number(cacheRow?.in_tok_prior ?? 0); const cachePrior = Number(cacheRow?.cache_prior ?? 0)

  const modelRows = await db.execute<{ model: string | null; cost: string }>(sql`
    SELECT m.model, COALESCE(SUM(
      m.input_tokens * mp.input_per_mtok / 1e6
    + m.output_tokens * mp.output_per_mtok / 1e6
    + m.cache_creation_tokens * mp.cache_write_5m_per_mtok / 1e6
    + m.cache_read_tokens * mp.cache_read_per_mtok / 1e6
    ), 0)::float8 AS cost
    FROM messages m
    LEFT JOIN model_pricing mp ON mp.model = m.model
    WHERE m.role = 'assistant' AND m.timestamp >= ${wStart}::timestamptz AND m.timestamp <= ${wEnd}::timestamptz
    GROUP BY m.model
    ORDER BY cost DESC
    LIMIT 5
  `) as unknown as Array<{ model: string | null; cost: string }>
  const totalModelCost = modelRows.reduce((s, r) => s + Number(r.cost), 0)
  const topModel = modelRows[0]?.model
    ? { model: modelRows[0].model!, pctOfCost: totalModelCost > 0 ? Number(modelRows[0].cost) / totalModelCost : 0 }
    : null

  const modelRowsPrior = await db.execute<{ model: string | null; cost: string }>(sql`
    SELECT m.model, COALESCE(SUM(
      m.input_tokens * mp.input_per_mtok / 1e6
    + m.output_tokens * mp.output_per_mtok / 1e6
    + m.cache_creation_tokens * mp.cache_write_5m_per_mtok / 1e6
    + m.cache_read_tokens * mp.cache_read_per_mtok / 1e6
    ), 0)::float8 AS cost
    FROM messages m
    LEFT JOIN model_pricing mp ON mp.model = m.model
    WHERE m.role = 'assistant' AND m.timestamp >= ${pStart}::timestamptz AND m.timestamp <= ${pEnd}::timestamptz
    GROUP BY m.model
  `) as unknown as Array<{ model: string | null; cost: string }>
  const totalPriorCost = modelRowsPrior.reduce((s, r) => s + Number(r.cost), 0)
  const priorTopModel = topModel ? modelRowsPrior.find((r) => r.model === topModel.model) : undefined
  const topModelPctPrior = priorTopModel && totalPriorCost > 0 ? Number(priorTopModel.cost) / totalPriorCost : 0

  const active = await db.execute<{ session_id: string; project_path: string | null }>(sql`
    SELECT session_id, project_path FROM sessions WHERE status = 'active' ORDER BY started_at DESC LIMIT 3
  `) as unknown as Array<{ session_id: string; project_path: string | null }>

  return {
    todayCost: Number(cost?.today ?? 0),
    windowCost: Number(cost?.window ?? 0),
    windowCostPriorPeriod: Number(cost?.window_prior ?? 0),
    cacheHitPct: inTok + cacheTok > 0 ? cacheTok / (inTok + cacheTok) : 0,
    cacheHitPctPrior: inTokPrior + cachePrior > 0 ? cachePrior / (inTokPrior + cachePrior) : 0,
    topModel,
    topModelPctPrior,
    activeSessions: { count: active.length, sample: active.map((a) => ({ sessionId: a.session_id, projectPath: a.project_path })) },
  }
}

export async function getSpendStackedByModel(w: Window) {
  const db = getDb()
  const wDayStart = ds(w.start); const wDayEnd = ds(w.end)
  const rows = await db.execute<{ day: string; model: string; cost: string }>(sql`
    SELECT u.day::text AS day, u.model, COALESCE(SUM(
      u.input_tokens * mp.input_per_mtok / 1e6
    + u.output_tokens * mp.output_per_mtok / 1e6
    + u.cache_creation * mp.cache_write_5m_per_mtok / 1e6
    + u.cache_read * mp.cache_read_per_mtok / 1e6
    ), 0)::float8 AS cost
    FROM usage_daily u
    LEFT JOIN model_pricing mp ON mp.model = u.model
    WHERE u.day::date >= ${wDayStart}::date
      AND u.day::date <= ${wDayEnd}::date
    GROUP BY u.day, u.model
    ORDER BY u.day ASC
  `) as unknown as Array<{ day: string; model: string; cost: string }>
  return rows.map((r) => ({ day: r.day.slice(0, 10), model: r.model, cost: Number(r.cost) }))
}

export async function getTopCostSessions(w: Window, limit = 5) {
  const db = getDb()
  const wStart = ts(w.start); const wEnd = ts(w.end)
  const rows = await db.execute<{
    session_id: string; project_path: string | null; started_at: string
    duration_sec: string | null; message_count: string | null
    models_used: string[] | null; cost: string | null
  }>(sql`
    SELECT session_id, project_path, started_at::text, duration_sec, message_count, models_used, estimated_cost_usd::float8::text AS cost
    FROM sessions
    WHERE started_at >= ${wStart}::timestamptz AND started_at <= ${wEnd}::timestamptz AND estimated_cost_usd IS NOT NULL
    ORDER BY estimated_cost_usd DESC NULLS LAST
    LIMIT ${limit}
  `) as unknown as Array<{
    session_id: string; project_path: string | null; started_at: string
    duration_sec: string | null; message_count: string | null
    models_used: string[] | null; cost: string | null
  }>
  return rows.map((r) => ({
    sessionId: r.session_id, projectPath: r.project_path,
    startedAt: new Date(r.started_at).toISOString(),
    durationSec: Number(r.duration_sec ?? 0), messageCount: Number(r.message_count ?? 0),
    modelsUsed: r.models_used ?? [], cost: Number(r.cost ?? 0),
  }))
}

export async function getCostDistribution(w: Window) {
  const db = getDb()
  const wStart = ts(w.start); const wEnd = ts(w.end)
  const rows = await db.execute<{ p50: string; p95: string; p99: string; max: string; n: string }>(sql`
    SELECT
      percentile_cont(0.5) WITHIN GROUP (ORDER BY estimated_cost_usd)::float8::text AS p50,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY estimated_cost_usd)::float8::text AS p95,
      percentile_cont(0.99) WITHIN GROUP (ORDER BY estimated_cost_usd)::float8::text AS p99,
      MAX(estimated_cost_usd)::float8::text AS max,
      COUNT(*)::int AS n
    FROM sessions
    WHERE started_at >= ${wStart}::timestamptz AND started_at <= ${wEnd}::timestamptz AND estimated_cost_usd IS NOT NULL
  `) as unknown as Array<{ p50: string; p95: string; p99: string; max: string; n: string }>
  const r = rows[0]
  return {
    p50: Number(r?.p50 ?? 0), p95: Number(r?.p95 ?? 0),
    p99: Number(r?.p99 ?? 0), max: Number(r?.max ?? 0), count: Number(r?.n ?? 0),
  }
}

export async function getCacheHitTrend(w: Window) {
  const db = getDb()
  const wDayStart = ds(w.start); const wDayEnd = ds(w.end)
  const rows = await db.execute<{ day: string; hit_pct: string }>(sql`
    SELECT day::text AS day,
           CASE WHEN SUM(input_tokens + cache_read) > 0
                THEN SUM(cache_read)::float8 / SUM(input_tokens + cache_read)::float8
                ELSE 0 END::float8::text AS hit_pct
    FROM usage_daily
    WHERE day::date >= ${wDayStart}::date
      AND day::date <= ${wDayEnd}::date
    GROUP BY day ORDER BY day ASC
  `) as unknown as Array<{ day: string; hit_pct: string }>
  return rows.map((r) => ({ day: r.day.slice(0, 10), hitPct: Number(r.hit_pct) }))
}

export async function getActiveHoursHeatmap(w: Window) {
  const minStart = new Date(Math.min(w.start.getTime(), Date.now() - 30 * 24 * 60 * 60 * 1000))
  const db = getDb()
  const minStartStr = ts(minStart); const wEnd = ts(w.end)
  const rows = await db.execute<{ dow: string; h: string; n: string }>(sql`
    SELECT EXTRACT(dow FROM started_at AT TIME ZONE 'America/New_York')::int AS dow,
           EXTRACT(hour FROM started_at AT TIME ZONE 'America/New_York')::int AS h,
           COUNT(*)::int AS n
    FROM sessions
    WHERE started_at >= ${minStartStr}::timestamptz AND started_at <= ${wEnd}::timestamptz
    GROUP BY 1, 2
  `) as unknown as Array<{ dow: string; h: string; n: string }>
  const grid: number[] = new Array(7 * 24).fill(0)
  for (const r of rows) grid[Number(r.dow) * 24 + Number(r.h)] = Number(r.n)
  return { cells: grid, windowStart: minStart, windowEnd: w.end, clamped: minStart < w.start }
}
