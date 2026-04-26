import { describe, expect, it } from 'vitest'
import { computeBriefing, renderBriefing } from './briefing'

describe('computeBriefing', () => {
  it('omits delta line when prior period has zero spend', () => {
    const b = computeBriefing({
      windowCost: 10, windowCostPriorPeriod: 0,
      cacheHitPct: 0.5, cacheHitPctPrior: 0.4,
      topProject: { project: 'foo', model: 'opus', cost: 7 },
      windowLabel: 'Last 7d', isPartialDay: false,
    })
    expect(b.lines[0]).toMatch(/\$10/)
    expect(b.lines[0]).not.toMatch(/vs prior/)
  })

  it('uses today so far label when partial day', () => {
    const b = computeBriefing({
      windowCost: 5, windowCostPriorPeriod: 4,
      cacheHitPct: 0.5, cacheHitPctPrior: 0.5,
      topProject: { project: 'foo', model: 'opus', cost: 3 },
      windowLabel: 'Today', isPartialDay: true,
    })
    expect(b.lines[0]).toMatch(/today so far/i)
  })

  it('emits dash for delta when prior data missing', () => {
    const b = computeBriefing({
      windowCost: 12, windowCostPriorPeriod: NaN,
      cacheHitPct: 0.5, cacheHitPctPrior: 0.5,
      topProject: { project: 'bar', model: 'sonnet', cost: 8 },
      windowLabel: 'Last 7d', isPartialDay: false,
    })
    expect(b.lines[0]).toMatch(/—/)
  })

  it('formats positive vs negative delta correctly', () => {
    const up = computeBriefing({
      windowCost: 100, windowCostPriorPeriod: 50,
      cacheHitPct: 0.5, cacheHitPctPrior: 0.5,
      topProject: { project: 'p', model: 'm', cost: 50 },
      windowLabel: 'Last 7d', isPartialDay: false,
    })
    expect(up.lines[0]).toMatch(/\+100%/)
    const down = computeBriefing({
      windowCost: 25, windowCostPriorPeriod: 50,
      cacheHitPct: 0.5, cacheHitPctPrior: 0.5,
      topProject: { project: 'p', model: 'm', cost: 12 },
      windowLabel: 'Last 7d', isPartialDay: false,
    })
    expect(down.lines[0]).toMatch(/−50%/)
  })

  it('renders to plain string', () => {
    const b = computeBriefing({
      windowCost: 100, windowCostPriorPeriod: 80,
      cacheHitPct: 0.31, cacheHitPctPrior: 0.52,
      topProject: { project: 'cca', model: 'opus', cost: 48 },
      windowLabel: 'Last 7d', isPartialDay: false,
    })
    const out = renderBriefing(b)
    expect(out).toMatch(/Burn/)
    expect(out).toMatch(/cca/)
    expect(out).toMatch(/Opus/)
  })
})
