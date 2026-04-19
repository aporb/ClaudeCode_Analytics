import { Command } from 'commander'
import pc from 'picocolors'
import { getDb, closeDb } from '@cca/db'
import { sql } from 'drizzle-orm'
import { parseSince } from '../lib/since.js'

interface Row {
  session_id: string
  timestamp: Date
  role: string
  project_path: string | null
  snippet: string
  rank: number
}

export function searchCommand(): Command {
  return new Command('search')
    .description('Full-text search across all ingested messages')
    .argument('<query>', 'search terms (plainto_tsquery format)')
    .option('--since <expr>', 'e.g. 7d')
    .option('--project <glob>', 'project path substring (ILIKE)')
    .option('--limit <n>', 'max rows', '20')
    .action(async (query: string, opts: { since?: string; project?: string; limit: string }) => {
      const db = getDb()
      const sinceDate = opts.since ? parseSince(opts.since) : null
      const since = sinceDate ? sinceDate.toISOString() : null
      const rows = await db.execute<Record<string, unknown>>(sql`
        SELECT
          m.session_id,
          m.timestamp,
          m.role,
          s.project_path,
          ts_headline('english', m.text_content, plainto_tsquery('english', ${query}),
            'MaxWords=20, MinWords=5, ShortWord=2, MaxFragments=1, FragmentDelimiter=" … "'
          ) AS snippet,
          ts_rank(m.text_tsv, plainto_tsquery('english', ${query})) AS rank
        FROM messages m
        LEFT JOIN sessions s USING (session_id)
        WHERE m.text_tsv @@ plainto_tsquery('english', ${query})
          ${since ? sql`AND m.timestamp >= ${since}` : sql``}
          ${opts.project ? sql`AND s.project_path ILIKE ${'%' + opts.project + '%'}` : sql``}
        ORDER BY rank DESC, m.timestamp DESC
        LIMIT ${Number(opts.limit)}
      `)

      const results = rows as unknown as Row[]
      if (results.length === 0) { console.log(pc.dim('no matches')); await closeDb(); return }

      for (const r of results) {
        const when = new Date(r.timestamp).toISOString().slice(0, 19).replace('T', ' ')
        console.log(
          `${pc.dim(when)} ${pc.cyan(r.role.padEnd(10))} ${pc.yellow(r.session_id.slice(0, 8))} ${pc.dim(r.project_path ?? '')}`,
        )
        console.log(`  ${r.snippet.replace(/\s+/g, ' ')}`)
      }

      await closeDb()
    })
}
