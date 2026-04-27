import pc from 'picocolors'

export interface HostRow {
  host: string
  events: number
  lastPulledAt: Date | null
  currentIntervalHours: number | null
  consecutiveErrors: number | null
}

/** Sort hosts: `local` first, then alphabetical. */
export function sortHosts<T extends { host: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.host === 'local') return -1
    if (b.host === 'local') return 1
    return a.host.localeCompare(b.host)
  })
}

/** "2026-04-26 09:00" — UTC, no seconds. Returns em-dash for null. */
export function formatLastPulled(d: Date | null): string {
  if (!d) return '—'
  const iso = d.toISOString() // e.g. 2026-04-26T09:00:00.000Z
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`
}

/**
 * "next in" duration: lastPulledAt + intervalHours - now.
 * Returns "—" if last/interval missing, "due now" if overdue,
 * else "Xh Ym" or "Ym".
 */
export function formatNextIn(
  lastPulledAt: Date | null,
  intervalHours: number | null,
  now: Date = new Date(),
): { text: string; overdue: boolean; absent: boolean } {
  if (!lastPulledAt || intervalHours == null) {
    return { text: '—', overdue: false, absent: true }
  }
  const dueMs = lastPulledAt.getTime() + intervalHours * 3600_000 - now.getTime()
  if (dueMs <= 0) return { text: 'due now', overdue: true, absent: false }
  const totalMin = Math.round(dueMs / 60_000)
  const hours = Math.floor(totalMin / 60)
  const mins = totalMin % 60
  const text = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`
  return { text, overdue: false, absent: false }
}

/** Health dot: green for 0/local, yellow for 1-2, red for 3+. */
export function healthDot(host: string, consecutiveErrors: number | null): string {
  const errs = consecutiveErrors ?? 0
  if (host === 'local' || errs === 0) return pc.green('●')
  if (errs <= 2) return pc.yellow('●')
  return pc.red('●')
}

interface Col {
  header: string
  values: string[]
  /** Visible width of value (after stripping ANSI). */
  widths: number[]
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: ESC (\x1b) is the literal start byte of ANSI escape sequences — exactly what we want to strip.
const ANSI_RE = /\x1b\[[0-9;]*m/g
function visibleWidth(s: string): number {
  return s.replace(ANSI_RE, '').length
}
function padRight(s: string, target: number): string {
  const pad = target - visibleWidth(s)
  return pad > 0 ? s + ' '.repeat(pad) : s
}

/**
 * Render a HOSTS table given fully-resolved row data.
 * Returns an array of lines (caller console.logs them).
 */
export function renderHostsTable(rows: HostRow[], now: Date = new Date()): string[] {
  const sorted = sortHosts(rows)

  const headers = ['HOST', 'EVENTS', 'LAST PULLED', 'NEXT IN', 'HEALTH']
  const cols: Col[] = headers.map((h) => ({ header: h, values: [], widths: [] }))

  for (const r of sorted) {
    const host = r.host
    const events = Number(r.events ?? 0).toLocaleString()
    const lastPulled = formatLastPulled(r.lastPulledAt)
    const next = formatNextIn(r.lastPulledAt, r.currentIntervalHours, now)
    const nextRendered = next.overdue ? pc.dim(next.text) : next.text
    const health = healthDot(host, r.consecutiveErrors)

    const cells = [host, events, lastPulled, nextRendered, health]
    cells.forEach((c, i) => {
      cols[i]?.values.push(c)
      cols[i]?.widths.push(visibleWidth(c))
    })
  }

  // Compute column widths (header vs values), pad with 4 spaces between cols.
  const colWidth = cols.map((c) => Math.max(c.header.length, ...(c.widths.length ? c.widths : [0])))

  const SEP = '    '
  const headerLine = `  ${cols.map((c, i) => padRight(c.header, colWidth[i]!)).join(SEP)}`
  const lines = [headerLine]
  for (let i = 0; i < sorted.length; i++) {
    const row = cols.map((c, j) => padRight(c.values[i]!, colWidth[j]!)).join(SEP)
    lines.push(`  ${row}`)
  }
  return lines
}
