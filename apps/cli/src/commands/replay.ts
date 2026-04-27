import { events, closeDb, getDb } from '@cca/db'
import { Command } from 'commander'
import { asc, eq, sql } from 'drizzle-orm'
import pc from 'picocolors'

export function replayCommand(): Command {
  return new Command('replay')
    .description('Print every event in a session in chronological order')
    .argument('<session-id>', 'session uuid (or uuid prefix)')
    .option('--raw', 'dump raw JSONB payload per event', false)
    .action(async (sessionId: string, opts: { raw: boolean }) => {
      const db = getDb()

      const resolvedRows = await db.execute<{ session_id: string }>(
        sql`SELECT DISTINCT session_id FROM events WHERE session_id LIKE ${`${sessionId}%`} LIMIT 2`,
      )
      const matches = resolvedRows as unknown as Array<{ session_id: string }>
      if (matches.length === 0) {
        console.error(pc.red(`no session matching "${sessionId}"`))
        process.exit(1)
      }
      if (matches.length > 1) {
        console.error(pc.red(`ambiguous prefix "${sessionId}"`))
        process.exit(1)
      }
      const fullId = matches[0]?.session_id
      if (!fullId) {
        console.error(pc.red(`no session matches "${sessionId}"`))
        process.exit(1)
      }

      const rows = await db
        .select()
        .from(events)
        .where(eq(events.sessionId, fullId))
        .orderBy(asc(events.timestamp))

      for (const r of rows) {
        const t = r.timestamp ? new Date(r.timestamp).toISOString().slice(11, 19) : '        '
        const tag = pc.cyan(`${r.type}/${r.subtype ?? '-'}`.padEnd(28))
        if (opts.raw) {
          console.log(`${pc.dim(t)} ${tag} ${JSON.stringify(r.payload)}`)
          continue
        }
        const payload = r.payload as { message?: { content?: unknown } } | undefined
        const msg = payload?.message?.content
        let preview = ''
        if (typeof msg === 'string') preview = msg
        else if (Array.isArray(msg)) {
          const textBlock = msg.find((b: any) => b?.type === 'text')
          const toolUse = msg.find((b: any) => b?.type === 'tool_use')
          const toolResult = msg.find((b: any) => b?.type === 'tool_result')
          if (textBlock) preview = String((textBlock as any).text ?? '')
          else if (toolUse)
            preview = pc.yellow(
              `→ ${(toolUse as any).name}(${JSON.stringify((toolUse as any).input).slice(0, 120)})`,
            )
          else if (toolResult)
            preview = pc.magenta(`← ${String((toolResult as any).content ?? '').slice(0, 120)}`)
        }
        console.log(`${pc.dim(t)} ${tag} ${preview.replace(/\s+/g, ' ').slice(0, 140)}`)
      }

      await closeDb()
    })
}
