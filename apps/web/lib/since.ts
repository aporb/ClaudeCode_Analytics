import dayjs from 'dayjs'

const REL = /^(\d+)([mhdwy])$/
const ISO_PAIR = /^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/

export interface Since {
  start: Date
  end: Date
  label: string
}

export function parseSince(expr: string, now: Date = new Date()): Date | null {
  if (!expr) return null
  if (expr === 'all') return null
  // 'today' = local midnight (user's timezone), not UTC
  if (expr === 'today') return dayjs(now).startOf('day').toDate()
  const m = REL.exec(expr)
  if (m) {
    const n = Number(m[1])
    const unit = m[2] as 'm' | 'h' | 'd' | 'w' | 'y'
    const map = { m: 'minute', h: 'hour', d: 'day', w: 'week', y: 'year' } as const
    return dayjs(now).subtract(n, map[unit]).toDate()
  }
  const parsed = dayjs(expr)
  return parsed.isValid() ? parsed.toDate() : null
}

const RELATIVE_LABELS: Record<string, string> = {
  today: 'Today',
  '1d': 'Last 24h',
  '7d': 'Last 7d',
  '30d': 'Last 30d',
  '90d': 'Last 90d',
  all: 'All time',
}

const DEFAULT_EXPR = '7d'

export function resolveSince(expr: string | undefined, now: Date = new Date()): Since {
  const e = expr ?? DEFAULT_EXPR
  const pair = ISO_PAIR.exec(e)
  if (pair) {
    const start = new Date(`${pair[1]}T00:00:00Z`)
    const end = new Date(`${pair[2]}T23:59:59.999Z`)
    return { start, end, label: `${pair[1]} → ${pair[2]}` }
  }
  if (e === 'all') {
    return { start: new Date(0), end: now, label: 'All time' }
  }
  const parsed = parseSince(e, now)
  if (parsed) {
    // Prefer the named label; otherwise derive 'Last <expr>' for arbitrary
    // relative units (e.g. '14d', '2w'). Only the genuinely-invalid path
    // below falls back to the default label.
    const label = RELATIVE_LABELS[e] ?? (REL.test(e) ? `Last ${e}` : `Last ${DEFAULT_EXPR}`)
    return { start: parsed, end: now, label }
  }
  const start = parseSince(DEFAULT_EXPR, now)!
  return { start, end: now, label: RELATIVE_LABELS[DEFAULT_EXPR] ?? `Last ${DEFAULT_EXPR}` }
}
