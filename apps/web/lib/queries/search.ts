import 'server-only'
import { sql } from 'drizzle-orm'
import { getDb } from '../db'

/** Build a Postgres ARRAY[…]::text[] SQL chunk from a JS string array. */
function pgTextArray(values: string[]) {
  return sql`ARRAY[${sql.join(
    values.map((v) => sql`${v}`),
    sql`, `,
  )}]::text[]`
}

export interface SearchQuery {
  q: string
  project?: string
  since?: { start: Date; end: Date }
  models?: string[]
  /** Host filter: null/undefined = all hosts; non-empty array = restrict to those hosts. */
  hosts?: string[] | null
  role?: 'user' | 'assistant'
  limit?: number
  offset?: number
}

export async function ftsSearch(args: SearchQuery) {
  const db = getDb()
  const sinceStart = args.since?.start.toISOString()
  const sinceEnd = args.since?.end.toISOString()
  const rows = await db.execute<{
    session_id: string
    timestamp: string
    role: string
    project_path: string | null
    snippet: string
    cost: string | null
    uuid: string
    host: string
  }>(sql`
    SELECT
      m.uuid,
      m.session_id,
      m.timestamp::text,
      m.role,
      s.project_path,
      s.host,
      ts_headline('english', m.text_content, plainto_tsquery('english', ${args.q}),
        'StartSel=<b>,StopSel=</b>,MaxWords=20,MinWords=10,MaxFragments=2,FragmentDelimiter=" … "') AS snippet,
      s.estimated_cost_usd::text AS cost
    FROM messages m
    JOIN sessions s ON s.session_id = m.session_id
    WHERE m.text_tsv @@ plainto_tsquery('english', ${args.q})
      ${args.role ? sql`AND m.role = ${args.role}` : sql``}
      ${args.project ? sql`AND s.project_path ILIKE ${`%${args.project}%`}` : sql``}
      ${sinceStart && sinceEnd ? sql`AND m.timestamp >= ${sinceStart}::timestamptz AND m.timestamp <= ${sinceEnd}::timestamptz` : sql``}
      ${args.models?.length ? sql`AND m.model = ANY(${pgTextArray(args.models)})` : sql``}
      ${args.hosts && args.hosts.length > 0 ? sql`AND s.host = ANY(${pgTextArray(args.hosts)})` : sql``}
    ORDER BY ts_rank(m.text_tsv, plainto_tsquery('english', ${args.q})) DESC, m.timestamp DESC
    LIMIT ${args.limit ?? 50}
    OFFSET ${args.offset ?? 0}
  `)
  return (
    rows as unknown as Array<{
      session_id: string
      timestamp: string
      role: string
      project_path: string | null
      snippet: string
      cost: string | null
      uuid: string
      host: string
    }>
  ).map((r) => ({
    sessionId: r.session_id,
    uuid: r.uuid,
    timestamp: new Date(r.timestamp).toISOString(),
    role: r.role,
    projectPath: r.project_path,
    host: r.host,
    snippet: r.snippet,
    cost: r.cost ? Number(r.cost) : null,
  }))
}

export async function countSearchResults(
  args: Omit<SearchQuery, 'limit' | 'offset'>,
): Promise<number> {
  const db = getDb()
  const sinceStart = args.since?.start.toISOString()
  const sinceEnd = args.since?.end.toISOString()
  const rows = (await db.execute<{ c: string }>(sql`
    SELECT COUNT(*)::bigint AS c FROM messages m
    JOIN sessions s ON s.session_id = m.session_id
    WHERE m.text_tsv @@ plainto_tsquery('english', ${args.q})
      ${args.role ? sql`AND m.role = ${args.role}` : sql``}
      ${args.project ? sql`AND s.project_path ILIKE ${`%${args.project}%`}` : sql``}
      ${sinceStart && sinceEnd ? sql`AND m.timestamp >= ${sinceStart}::timestamptz AND m.timestamp <= ${sinceEnd}::timestamptz` : sql``}
      ${args.models?.length ? sql`AND m.model = ANY(${pgTextArray(args.models)})` : sql``}
      ${args.hosts && args.hosts.length > 0 ? sql`AND s.host = ANY(${pgTextArray(args.hosts)})` : sql``}
  `)) as unknown as Array<{ c: string }>
  return Number(rows[0]?.c ?? 0)
}
