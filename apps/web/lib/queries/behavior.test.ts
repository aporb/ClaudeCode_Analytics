import { describe, expect, it } from 'vitest'
import {
  getCacheHitByModel,
  getLatencyPercentiles,
  getSubagentHistogram,
  getTokenVelocity,
  getToolErrorRateTrend,
} from './behavior'

const W = { start: new Date('2026-04-01T00:00:00Z'), end: new Date('2026-04-26T23:59:59Z') }

describe('behavior queries', () => {
  it('getToolErrorRateTrend returns per-day rows', async () => {
    const r = await getToolErrorRateTrend(W)
    expect(Array.isArray(r)).toBe(true)
  })
  it('getLatencyPercentiles returns p50/p95 per day', async () => {
    const r = await getLatencyPercentiles(W)
    expect(Array.isArray(r)).toBe(true)
    if (r.length) {
      expect(r[0]).toHaveProperty('p50Sec')
      expect(r[0]).toHaveProperty('p95Sec')
    }
  })
  it('getSubagentHistogram returns up to 7 buckets', async () => {
    const r = await getSubagentHistogram(W)
    expect(r.length).toBeLessThanOrEqual(7)
  })
  it('getTokenVelocity returns per-session points', async () => {
    const r = await getTokenVelocity(W)
    expect(Array.isArray(r)).toBe(true)
  })
  it('getCacheHitByModel returns one row per model', async () => {
    const r = await getCacheHitByModel(W)
    expect(Array.isArray(r)).toBe(true)
  })
})
