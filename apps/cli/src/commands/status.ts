import { Command } from 'commander'
import pc from 'picocolors'
import { getDb, closeDb, events, sessions } from '@cca/db'
import { sql } from 'drizzle-orm'
import { renderHostsTable, type HostRow } from '../lib/hostsTable.js'

export function statusCommand(): Command {
  return new Command('status')
    .description('Show daemon health, DB counts, and last event')
    .action(async () => {
      const db = getDb()
      const [ev] = await db
        .select({ count: sql<number>`count(*)`, last: sql<Date | null>`max(${events.timestamp})` })
        .from(events)
      const [se] = await db
        .select({
          count: sql<number>`count(*)`,
          active: sql<number>`count(*) filter (where ${sessions.status} = 'active')`,
        })
        .from(sessions)

      console.log(pc.bold('DB'))
      console.log(`  events:           ${Number(ev?.count ?? 0).toLocaleString()}`)
      console.log(`  sessions:         ${Number(se?.count ?? 0).toLocaleString()}`)
      console.log(`  active sessions:  ${Number(se?.active ?? 0)}`)
      console.log(`  last event:       ${ev?.last ? new Date(ev.last).toISOString() : 'never'}`)

      console.log(pc.bold('\nDaemon'))
      try {
        const r = await fetch('http://localhost:9939/status', { signal: AbortSignal.timeout(1000) })
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const d = await r.json() as { ok: boolean; uptimeSec: number; subscribers: number; lastEventAt: string | null }
        console.log(`  ${pc.green('●')} running`)
        console.log(`  uptime:           ${d.uptimeSec}s`)
        console.log(`  subscribers:      ${d.subscribers}`)
        console.log(`  last event seen:  ${d.lastEventAt ?? 'none yet'}`)
      } catch (e) {
        console.log(`  ${pc.red('●')} not reachable on localhost:9939`)
        console.log(pc.dim(`  (${(e as Error).message})`))
      }

      console.log(pc.bold('\nHosts'))
      try {
        const rows = await db.execute(sql`
          SELECT
            e.host AS host,
            e.count AS events,
            hss.last_pulled_at AS last_pulled_at,
            hss.current_interval_hours AS current_interval_hours,
            hss.consecutive_errors AS consecutive_errors
          FROM (SELECT host, count(*)::bigint AS count FROM events GROUP BY host) e
          LEFT JOIN host_sync_state hss ON hss.host = e.host
        `)
        // drizzle's postgres-js execute returns an array of row objects.
        const hostRows: HostRow[] = (rows as unknown as Array<{
          host: string
          events: string | number
          last_pulled_at: string | Date | null
          current_interval_hours: number | null
          consecutive_errors: number | null
        }>).map((r) => ({
          host: r.host,
          events: Number(r.events),
          lastPulledAt: r.last_pulled_at ? new Date(r.last_pulled_at as string) : null,
          currentIntervalHours: r.current_interval_hours ?? null,
          consecutiveErrors: r.consecutive_errors ?? null,
        }))

        if (hostRows.length === 0) {
          console.log(pc.dim('  (no events yet)'))
        } else {
          for (const line of renderHostsTable(hostRows)) console.log(line)
        }
      } catch (e) {
        console.log(pc.dim(`  (host query failed: ${(e as Error).message})`))
      }

      await closeDb()
    })
}
