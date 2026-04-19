import dayjs from 'dayjs'

const REL = /^(\d+)([mhdwy])$/

export function parseSince(expr: string, now: Date = new Date()): Date | null {
  const m = REL.exec(expr)
  if (m) {
    const n = Number(m[1])
    const unit = m[2] as 'm' | 'h' | 'd' | 'w' | 'y'
    const map = { m: 'minute', h: 'hour', d: 'day', w: 'week', y: 'year' } as const
    return dayjs(now).subtract(n, map[unit]).toDate()
  }
  const parsed = dayjs(expr)
  if (!parsed.isValid()) return null
  return parsed.toDate()
}
