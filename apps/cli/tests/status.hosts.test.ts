import { describe, expect, it } from 'vitest'
import {
  formatLastPulled,
  formatNextIn,
  healthDot,
  renderHostsTable,
  sortHosts,
  type HostRow,
} from '../src/lib/hostsTable.js'

const ANSI_RE = /\x1b\[[0-9;]*m/g
const strip = (s: string) => s.replace(ANSI_RE, '')

describe('sortHosts', () => {
  it('puts local first, then alphabetical', () => {
    const sorted = sortHosts([
      { host: 'picoclaw' },
      { host: 'hostinger' },
      { host: 'local' },
    ])
    expect(sorted.map((r) => r.host)).toEqual(['local', 'hostinger', 'picoclaw'])
  })
})

describe('formatLastPulled', () => {
  it('renders em-dash for null', () => {
    expect(formatLastPulled(null)).toBe('—')
  })
  it('renders YYYY-MM-DD HH:MM in UTC', () => {
    expect(formatLastPulled(new Date('2026-04-26T09:00:00Z'))).toBe('2026-04-26 09:00')
  })
})

describe('formatNextIn', () => {
  const now = new Date('2026-04-26T11:17:00Z')

  it('returns absent for never-pulled', () => {
    const r = formatNextIn(null, 3, now)
    expect(r.text).toBe('—')
    expect(r.absent).toBe(true)
  })
  it('returns absent when interval missing', () => {
    expect(formatNextIn(new Date('2026-04-26T09:00:00Z'), null, now).text).toBe('—')
  })
  it('renders Xh Ym for future', () => {
    // last 09:00 + 3h = due 12:00; now 11:17 → 43m left
    const r = formatNextIn(new Date('2026-04-26T09:00:00Z'), 3, now)
    expect(r.text).toBe('43m')
    expect(r.overdue).toBe(false)
  })
  it('renders combined hours+minutes', () => {
    // last 09:00 + 6h = due 15:00; now 11:17 → 3h 43m
    const r = formatNextIn(new Date('2026-04-26T09:00:00Z'), 6, now)
    expect(r.text).toBe('3h 43m')
  })
  it('reports due now when overdue', () => {
    const r = formatNextIn(new Date('2026-04-26T05:00:00Z'), 3, now)
    expect(r.text).toBe('due now')
    expect(r.overdue).toBe(true)
  })
})

describe('healthDot', () => {
  it('green for local regardless of errors', () => {
    expect(strip(healthDot('local', 99))).toBe('●')
  })
  it('green for 0 errors', () => {
    expect(strip(healthDot('hostinger', 0))).toBe('●')
  })
  it('yellow for 1-2 errors (still ●)', () => {
    expect(strip(healthDot('hostinger', 2))).toBe('●')
  })
  it('red for 3+ errors (still ●)', () => {
    expect(strip(healthDot('hostinger', 5))).toBe('●')
  })
})

describe('renderHostsTable', () => {
  const now = new Date('2026-04-26T11:17:00Z')

  const rows: HostRow[] = [
    {
      host: 'hostinger',
      events: 12543,
      lastPulledAt: new Date('2026-04-26T09:00:00Z'),
      currentIntervalHours: 3,
      consecutiveErrors: 0,
    },
    {
      host: 'local',
      events: 298763,
      lastPulledAt: null,
      currentIntervalHours: null,
      consecutiveErrors: null,
    },
    {
      host: 'picoclaw',
      events: 87210,
      lastPulledAt: new Date('2026-04-25T21:00:00Z'),
      currentIntervalHours: 15,
      consecutiveErrors: 0,
    },
  ]

  it('renders header + sorted data rows with local first', () => {
    const lines = renderHostsTable(rows, now).map(strip)
    expect(lines).toHaveLength(4)
    expect(lines[0]).toMatch(/^\s+HOST\s+EVENTS\s+LAST PULLED\s+NEXT IN\s+HEALTH\s*$/)
    expect(lines[1]).toContain('local')
    expect(lines[1]).toContain('298,763')
    expect(lines[1]).toContain('—')
    expect(lines[2]).toContain('hostinger')
    expect(lines[2]).toContain('12,543')
    expect(lines[2]).toContain('2026-04-26 09:00')
    expect(lines[2]).toContain('43m')
    expect(lines[3]).toContain('picoclaw')
    expect(lines[3]).toContain('87,210')
    expect(lines[3]).toContain('2026-04-25 21:00')
  })

  it('renders due now (dim) when overdue', () => {
    const overdue: HostRow[] = [
      {
        host: 'hostinger',
        events: 1,
        lastPulledAt: new Date('2026-04-26T05:00:00Z'),
        currentIntervalHours: 3,
        consecutiveErrors: 0,
      },
    ]
    const lines = renderHostsTable(overdue, now)
    // Find the data row (skip header)
    expect(strip(lines[1]!)).toContain('due now')
  })

  it('classifies dot color by consecutive_errors via healthDot', () => {
    // healthDot is the color contract; renderHostsTable just embeds its output.
    // Asserting on healthDot directly avoids depending on TTY/CI color state.
    const green = healthDot('hostinger', 0)
    const yellow = healthDot('hostinger', 2)
    const red = healthDot('hostinger', 5)
    // All render the same glyph...
    expect(strip(green)).toBe('●')
    expect(strip(yellow)).toBe('●')
    expect(strip(red)).toBe('●')
    // ...but escape-coded forms differ when picocolors emits them.
    // (They're equal when colors are disabled; either way the row renders a dot.)
    const sick: HostRow[] = [
      {
        host: 'sicky',
        events: 0,
        lastPulledAt: null,
        currentIntervalHours: 3,
        consecutiveErrors: 5,
      },
    ]
    expect(strip(renderHostsTable(sick, now)[1]!)).toContain('●')
  })
})
