import { Command } from 'commander'
import pc from 'picocolors'
import { getDb, closeDb, events, sessions } from '@cca/db'
import { sql } from 'drizzle-orm'

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

      await closeDb()
    })
}
