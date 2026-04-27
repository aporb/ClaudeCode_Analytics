import { closeDb, getDb, sessions } from '@cca/db'
import { Command } from 'commander'
import { and, desc, gte, ilike, sql } from 'drizzle-orm'
import pc from 'picocolors'
import { parseSince } from '../lib/since.js'

export function sessionsCommand(): Command {
  return new Command('sessions')
    .description('List sessions, newest first')
    .option('--project <glob>', 'filter by project path substring (ILIKE)')
    .option('--since <expr>', 'e.g. 7d, 24h, 2026-04-01')
    .option('--model <name>', 'filter to sessions that used this model')
    .option('--limit <n>', 'max rows', '25')
    .action(async (opts: { project?: string; since?: string; model?: string; limit: string }) => {
      const db = getDb()
      const conditions = []
      if (opts.project) conditions.push(ilike(sessions.projectPath, `%${opts.project}%`))
      if (opts.since) conditions.push(gte(sessions.startedAt, parseSince(opts.since)))
      if (opts.model) conditions.push(sql`${opts.model} = ANY(${sessions.modelsUsed})`)

      const rows = await db
        .select({
          sessionId: sessions.sessionId,
          projectPath: sessions.projectPath,
          startedAt: sessions.startedAt,
          durationSec: sessions.durationSec,
          messageCount: sessions.messageCount,
          toolCallCount: sessions.toolCallCount,
          cost: sessions.estimatedCostUsd,
          firstPrompt: sessions.firstUserPrompt,
          status: sessions.status,
        })
        .from(sessions)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(sessions.startedAt))
        .limit(Number(opts.limit))

      if (rows.length === 0) {
        console.log(pc.dim('no sessions found'))
        await closeDb()
        return
      }

      for (const r of rows) {
        const dot = r.status === 'active' ? pc.green('●') : pc.dim('○')
        const when = r.startedAt
          ? new Date(r.startedAt).toISOString().slice(0, 19).replace('T', ' ')
          : '?'
        const dur = r.durationSec ? `${Math.round(r.durationSec / 60)}m` : '?'
        const msgs = String(r.messageCount ?? 0).padStart(4)
        const tools = String(r.toolCallCount ?? 0).padStart(4)
        const cost = r.cost ? `$${Number(r.cost).toFixed(2)}`.padStart(8) : '       -'
        const preview = (r.firstPrompt ?? '').replace(/\s+/g, ' ').slice(0, 60)
        console.log(
          `${dot} ${pc.dim(when)} ${pc.cyan(dur.padStart(4))} ${msgs}m ${tools}t ${cost} ${pc.yellow(r.sessionId.slice(0, 8))} ${pc.dim(r.projectPath ?? '')}`,
        )
        if (preview) console.log(`  ${pc.dim(preview)}`)
      }

      await closeDb()
    })
}
