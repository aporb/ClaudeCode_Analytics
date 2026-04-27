import { closeDb, getDb } from '@cca/db'
import { Command } from 'commander'
import { sql } from 'drizzle-orm'
import pc from 'picocolors'
import { parseSince } from '../lib/since.js'

interface ModelRow {
  model: string
  in_tok: number
  out_tok: number
  cost: number
}
interface ProjectRow {
  project_path: string | null
  sessions: number
  cost: number
}
interface ToolRow {
  tool_name: string
  calls: number
  errors: number
}

export function statsCommand(): Command {
  return new Command('stats')
    .description('Aggregate stats: tokens, cost, tools, projects')
    .option('--since <expr>', 'window, e.g. 7d', '30d')
    .action(async (opts: { since: string }) => {
      const db = getDb()
      const since = parseSince(opts.since).toISOString()

      const models = await db.execute<Record<string, unknown>>(sql`
        SELECT model, SUM(input_tokens)::bigint AS in_tok, SUM(output_tokens)::bigint AS out_tok,
               SUM(
                 (input_tokens::numeric / 1e6) * p.input_per_mtok
               + (output_tokens::numeric / 1e6) * p.output_per_mtok
               + (cache_creation_tokens::numeric / 1e6) * p.cache_write_5m_per_mtok
               + (cache_read_tokens::numeric / 1e6) * p.cache_read_per_mtok
               )::numeric(10,2) AS cost
        FROM messages m LEFT JOIN model_pricing p USING (model)
        WHERE m.role = 'assistant' AND m.timestamp >= ${since} AND m.model IS NOT NULL
        GROUP BY m.model ORDER BY cost DESC NULLS LAST LIMIT 10
      `)
      const projects = await db.execute<Record<string, unknown>>(sql`
        SELECT project_path, COUNT(*) AS sessions, SUM(estimated_cost_usd)::numeric(10,2) AS cost
        FROM sessions
        WHERE started_at >= ${since}
        GROUP BY project_path ORDER BY cost DESC NULLS LAST LIMIT 10
      `)
      const tools = await db.execute<Record<string, unknown>>(sql`
        SELECT tool_name, COUNT(*) AS calls, COUNT(*) FILTER (WHERE is_error) AS errors
        FROM tool_calls WHERE timestamp >= ${since}
        GROUP BY tool_name ORDER BY calls DESC LIMIT 10
      `)

      console.log(pc.bold(`\nTop models since ${opts.since}`))
      for (const m of models as unknown as ModelRow[]) {
        console.log(
          `  ${m.model.padEnd(36)} in=${Number(m.in_tok).toLocaleString().padStart(12)}  out=${Number(m.out_tok).toLocaleString().padStart(10)}  $${Number(m.cost).toFixed(2)}`,
        )
      }

      console.log(pc.bold(`\nTop projects since ${opts.since}`))
      for (const p of projects as unknown as ProjectRow[]) {
        console.log(
          `  ${(p.project_path ?? '(none)').padEnd(60)} ${String(p.sessions).padStart(4)} sessions  $${Number(p.cost ?? 0).toFixed(2)}`,
        )
      }

      console.log(pc.bold(`\nTop tools since ${opts.since}`))
      for (const t of tools as unknown as ToolRow[]) {
        const errRate =
          t.calls > 0 ? ((Number(t.errors) / Number(t.calls)) * 100).toFixed(1) : '0.0'
        console.log(
          `  ${t.tool_name.padEnd(16)} calls=${String(t.calls).padStart(6)}  errors=${String(t.errors).padStart(4)} (${errRate}%)`,
        )
      }

      await closeDb()
    })
}
