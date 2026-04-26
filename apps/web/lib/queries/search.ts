import 'server-only'
import { getDb } from '../db'
import { sql } from 'drizzle-orm'

export interface SearchQuery {
  q: string
  project?: string
  since?: { start: Date; end: Date }
  models?: string[]
  role?: 'user' | 'assistant'
  limit?: number
  offset?: number
}

export async function ftsSearch(args: SearchQuery) {
  const db = getDb()
  const rows = await db.execute<{
    session_id: string; timestamp: string; role: string; project_path: string | null
    snippet: string; cost: string | null; uuid: string
  }>(sql`
    SELECT
      m.uuid,
      m.session_id,
      m.timestamp::text,
      m.role,
      s.project_path,
      ts_headline('english', m.text_content, plainto_tsquery('english', ${args.q}),
        'StartSel=<b>,StopSel=</b>,MaxWords=20,MinWords=10,MaxFragments=2,FragmentDelimiter=" … "') AS snippet,
      s.estimated_cost_usd::text AS cost
    FROM messages m
    JOIN sessions s ON s.session_id = m.session_id
    WHERE m.text_tsv @@ plainto_tsquery('english', ${args.q})
      ${args.role ? sql`AND m.role = ${args.role}` : sql``}
      ${args.project ? sql`AND s.project_path ILIKE ${'%' + args.project + '%'}` : sql``}
      ${args.since ? sql`AND m.timestamp >= ${args.since.start} AND m.timestamp <= ${args.since.end}` : sql``}
      ${args.models?.length ? sql`AND m.model = ANY(${args.models})` : sql``}
    ORDER BY ts_rank(m.text_tsv, plainto_tsquery('english', ${args.q})) DESC, m.timestamp DESC
    LIMIT ${args.limit ?? 50}
    OFFSET ${args.offset ?? 0}
  `)
  return (rows as unknown as Array<{
    session_id: string; timestamp: string; role: string; project_path: string | null
    snippet: string; cost: string | null; uuid: string
  }>).map((r) => ({
    sessionId: r.session_id,
    uuid: r.uuid,
    timestamp: new Date(r.timestamp).toISOString(),
    role: r.role,
    projectPath: r.project_path,
    snippet: r.snippet,
    cost: r.cost ? Number(r.cost) : null,
  }))
}

export async function countSearchResults(args: Omit<SearchQuery, 'limit' | 'offset'>): Promise<number> {
  const db = getDb()
  const rows = (await db.execute<{ c: string }>(sql`
    SELECT COUNT(*)::bigint AS c FROM messages m
    JOIN sessions s ON s.session_id = m.session_id
    WHERE m.text_tsv @@ plainto_tsquery('english', ${args.q})
      ${args.role ? sql`AND m.role = ${args.role}` : sql``}
      ${args.project ? sql`AND s.project_path ILIKE ${'%' + args.project + '%'}` : sql``}
      ${args.since ? sql`AND m.timestamp >= ${args.since.start} AND m.timestamp <= ${args.since.end}` : sql``}
      ${args.models?.length ? sql`AND m.model = ANY(${args.models})` : sql``}
  `)) as unknown as Array<{ c: string }>
  return Number(rows[0]?.c ?? 0)
}
