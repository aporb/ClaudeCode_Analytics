import dayjs from 'dayjs'
import { describe, expect, it } from 'vitest'
import { parseSince, resolveSince } from './since'

describe('parseSince', () => {
  const NOW = new Date('2026-04-26T13:00:00Z')

  it('parses relative units (m/h/d/w/y)', () => {
    expect(parseSince('1d', NOW)?.toISOString()).toBe('2026-04-25T13:00:00.000Z')
    expect(parseSince('7d', NOW)?.toISOString()).toBe('2026-04-19T13:00:00.000Z')
    expect(parseSince('1w', NOW)?.toISOString()).toBe('2026-04-19T13:00:00.000Z')
    expect(parseSince('2h', NOW)?.toISOString()).toBe('2026-04-26T11:00:00.000Z')
  })

  it('parses the today token at start of local day', () => {
    const got = parseSince('today', NOW)
    expect(got).not.toBeNull()
    expect(got?.getHours()).toBe(0)
    expect(got?.getMinutes()).toBe(0)
  })

  it('today is local midnight regardless of host timezone', () => {
    // Timezone-agnostic: assert against dayjs.startOf('day') directly so the
    // test passes anywhere, and confirm 'today' is never in the future.
    const got = parseSince('today', NOW)
    expect(got).not.toBeNull()
    expect(got?.getTime()).toBe(dayjs(NOW).startOf('day').valueOf())
    expect(got?.getTime()).toBeLessThanOrEqual(NOW.getTime())
  })

  it('parses the all token as null sentinel', () => {
    expect(parseSince('all', NOW)).toBeNull()
  })

  it('parses ISO single dates', () => {
    expect(parseSince('2026-04-01', NOW)?.toISOString().slice(0, 10)).toBe('2026-04-01')
  })

  it('returns null for garbage', () => {
    expect(parseSince('garbage', NOW)).toBeNull()
    expect(parseSince('', NOW)).toBeNull()
  })
})

describe('resolveSince', () => {
  const NOW = new Date('2026-04-26T13:00:00Z')

  it('returns {start,end} for a relative window', () => {
    const r = resolveSince('7d', NOW)
    expect(r.start.toISOString()).toBe('2026-04-19T13:00:00.000Z')
    expect(r.end.toISOString()).toBe(NOW.toISOString())
    expect(r.label).toBe('Last 7d')
  })

  it('returns ISO-pair window', () => {
    const r = resolveSince('2026-04-01..2026-04-15', NOW)
    expect(r.start.toISOString().slice(0, 10)).toBe('2026-04-01')
    expect(r.end.toISOString().slice(0, 10)).toBe('2026-04-15')
    expect(r.label).toBe('2026-04-01 → 2026-04-15')
  })

  it('returns all time with start = epoch', () => {
    const r = resolveSince('all', NOW)
    expect(r.start.toISOString()).toBe('1970-01-01T00:00:00.000Z')
    expect(r.end.toISOString()).toBe(NOW.toISOString())
    expect(r.label).toBe('All time')
  })

  it('falls back to default 7d when expr is undefined', () => {
    const r = resolveSince(undefined, NOW)
    expect(r.start.toISOString()).toBe('2026-04-19T13:00:00.000Z')
    expect(r.label).toBe('Last 7d')
  })

  it('falls back to default for invalid expr', () => {
    const r = resolveSince('garbage', NOW)
    expect(r.start.toISOString()).toBe('2026-04-19T13:00:00.000Z')
    expect(r.label).toBe('Last 7d')
  })

  it('derives label for arbitrary relative-unit expressions (14d)', () => {
    const r = resolveSince('14d', NOW)
    expect(r.start.toISOString()).toBe('2026-04-12T13:00:00.000Z')
    expect(r.end.toISOString()).toBe(NOW.toISOString())
    expect(r.label).toBe('Last 14d')
  })

  it('derives label for arbitrary relative-unit expressions (2w)', () => {
    const r = resolveSince('2w', NOW)
    expect(r.start.toISOString()).toBe('2026-04-12T13:00:00.000Z')
    expect(r.label).toBe('Last 2w')
  })
})
