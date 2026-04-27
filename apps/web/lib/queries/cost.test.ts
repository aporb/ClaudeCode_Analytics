import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  getActiveHoursHeatmap,
  getCacheHitTrend,
  getCostDistribution,
  getCostKpis,
  getSpendStackedByModel,
  getTokenTotals,
  getTopCostSessions,
} from './cost'

const SINCE = { start: new Date('2026-04-01T00:00:00Z'), end: new Date('2026-04-26T23:59:59Z') }

describe('cost queries', () => {
  it('getCostKpis returns numeric fields', async () => {
    const k = await getCostKpis(SINCE)
    expect(k.todayCost).toBeGreaterThanOrEqual(0)
    expect(k.windowCost).toBeGreaterThanOrEqual(0)
    expect(k.cacheHitPct).toBeGreaterThanOrEqual(0)
    expect(k.cacheHitPct).toBeLessThanOrEqual(1)
    expect(k.activeSessions.count).toBeGreaterThanOrEqual(0)
  })

  it('getSpendStackedByModel returns one row per (day, model)', async () => {
    const rows = await getSpendStackedByModel(SINCE)
    expect(Array.isArray(rows)).toBe(true)
    if (rows.length) {
      const first = rows[0]!
      expect(first).toHaveProperty('day')
      expect(first).toHaveProperty('model')
      expect(first).toHaveProperty('cost')
      expect(typeof first.cost).toBe('number')
    }
  })

  it('getTopCostSessions returns up to 5 rows ordered DESC by cost', async () => {
    const rows = await getTopCostSessions(SINCE, 5)
    expect(rows.length).toBeLessThanOrEqual(5)
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1]?.cost ?? 0
      const curr = rows[i]?.cost ?? 0
      expect(prev).toBeGreaterThanOrEqual(curr)
    }
  })

  it('getCostDistribution returns p50/p95/p99/max', async () => {
    const d = await getCostDistribution(SINCE)
    expect(d).toHaveProperty('p50')
    expect(d).toHaveProperty('p95')
    expect(d).toHaveProperty('p99')
    expect(d).toHaveProperty('max')
    expect(d).toHaveProperty('count')
    expect(d.p99).toBeGreaterThanOrEqual(d.p95)
    expect(d.p95).toBeGreaterThanOrEqual(d.p50)
  })

  it('getCacheHitTrend returns one row per day', async () => {
    const rows = await getCacheHitTrend(SINCE)
    expect(Array.isArray(rows)).toBe(true)
    if (rows.length) {
      const first = rows[0]!
      expect(first).toHaveProperty('day')
      expect(first).toHaveProperty('hitPct')
    }
  })

  it('getActiveHoursHeatmap returns 168 cells (24h x 7dow)', async () => {
    const heatmap = await getActiveHoursHeatmap(SINCE)
    expect(heatmap.cells).toHaveLength(7 * 24)
  })
})

// Test data is isolated by a unique time window + dedicated test host names
// so it doesn't collide with real ingested data. Mirrors the pattern in
// hosts.test.ts: 2099 dates outside any real range, distinctive host names.
const TH_A = '__th_a__'
const TH_B = '__th_b__'
const TH_WIN_START = new Date('2099-02-01T00:00:00Z')
const TH_WIN_END = new Date('2099-02-28T23:59:59Z')
const URL = process.env.CCA_DATABASE_URL

describe('getTokenTotals', () => {
  let sql: postgres.Sql

  beforeAll(async () => {
    if (!URL) throw new Error('CCA_DATABASE_URL is not set')
    sql = postgres(URL, { max: 2, prepare: false })

    await sql`DELETE FROM sessions WHERE host IN (${TH_A}, ${TH_B})`
    // host A: 2 sessions in window
    await sql`
      INSERT INTO sessions (
        session_id, host, started_at,
        total_input_tokens, total_output_tokens, total_cache_creation, total_cache_read,
        estimated_cost_usd
      ) VALUES
        ('th_a1', ${TH_A}, '2099-02-05T10:00:00Z', 1000, 500, 100, 200, 1.50),
        ('th_a2', ${TH_A}, '2099-02-10T10:00:00Z', 2000, 700, 300, 400, 3.25)
    `
    // host B: 1 session in window
    await sql`
      INSERT INTO sessions (
        session_id, host, started_at,
        total_input_tokens, total_output_tokens, total_cache_creation, total_cache_read,
        estimated_cost_usd
      ) VALUES
        ('th_b1', ${TH_B}, '2099-02-15T10:00:00Z', 500, 250, 50, 75, 0.90)
    `
  })

  afterAll(async () => {
    await sql`DELETE FROM sessions WHERE host IN (${TH_A}, ${TH_B})`
    await sql.end()
  })

  it('sums across all hosts when hosts is null', async () => {
    const t = await getTokenTotals({
      sinceStart: TH_WIN_START,
      sinceEnd: TH_WIN_END,
      hosts: null,
    })
    expect(t.input).toBe(3500) // 1000 + 2000 + 500
    expect(t.output).toBe(1450) // 500 + 700 + 250
    expect(t.cacheCreation).toBe(450) // 100 + 300 + 50
    expect(t.cacheRead).toBe(675) // 200 + 400 + 75
    expect(t.total).toBe(3500 + 1450 + 450 + 675)
  })

  it('returns only host A totals when filtered to host A', async () => {
    const t = await getTokenTotals({
      sinceStart: TH_WIN_START,
      sinceEnd: TH_WIN_END,
      hosts: [TH_A],
    })
    expect(t.input).toBe(3000)
    expect(t.output).toBe(1200)
    expect(t.cacheCreation).toBe(400)
    expect(t.cacheRead).toBe(600)
    expect(t.total).toBe(3000 + 1200 + 400 + 600)
  })

  it('returns only host B totals when filtered to host B', async () => {
    const t = await getTokenTotals({
      sinceStart: TH_WIN_START,
      sinceEnd: TH_WIN_END,
      hosts: [TH_B],
    })
    expect(t.input).toBe(500)
    expect(t.output).toBe(250)
    expect(t.cacheCreation).toBe(50)
    expect(t.cacheRead).toBe(75)
  })
})
