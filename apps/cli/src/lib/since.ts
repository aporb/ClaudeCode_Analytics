import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc.js'

dayjs.extend(utc)

const REL = /^(\d+)([mhdwy])$/

export function parseSince(expr: string, now: Date = new Date()): Date {
  const m = REL.exec(expr)
  if (m) {
    const n = Number(m[1])
    const unit = m[2] as 'm' | 'h' | 'd' | 'w' | 'y'
    const map = { m: 'minute', h: 'hour', d: 'day', w: 'week', y: 'year' } as const
    return dayjs.utc(now).subtract(n, map[unit]).toDate()
  }
  const parsed = dayjs.utc(expr)
  if (!parsed.isValid()) throw new Error(`invalid --since value: ${expr}`)
  return parsed.toDate()
}
