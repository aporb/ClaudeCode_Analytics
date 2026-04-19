import { describe, it, expect } from 'vitest'
import { parseSince } from '../src/lib/since.js'

describe('parseSince', () => {
  const now = new Date('2026-04-19T12:00:00Z')

  it('parses relative durations', () => {
    expect(parseSince('7d', now).toISOString()).toBe('2026-04-12T12:00:00.000Z')
    expect(parseSince('24h', now).toISOString()).toBe('2026-04-18T12:00:00.000Z')
    expect(parseSince('30m', now).toISOString()).toBe('2026-04-19T11:30:00.000Z')
    expect(parseSince('2w', now).toISOString()).toBe('2026-04-05T12:00:00.000Z')
    expect(parseSince('1y', now).toISOString()).toBe('2025-04-19T12:00:00.000Z')
  })

  it('parses an absolute ISO date', () => {
    expect(parseSince('2026-04-01', now).toISOString()).toBe('2026-04-01T00:00:00.000Z')
  })

  it('throws on garbage', () => {
    expect(() => parseSince('banana', now)).toThrow()
  })
})
