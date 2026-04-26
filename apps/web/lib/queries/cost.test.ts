import { describe, expect, it } from 'vitest'
import {
  getCostKpis,
  getSpendStackedByModel,
  getTopCostSessions,
  getCostDistribution,
  getCacheHitTrend,
  getActiveHoursHeatmap,
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
      expect(rows[i - 1]!.cost).toBeGreaterThanOrEqual(rows[i]!.cost)
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
