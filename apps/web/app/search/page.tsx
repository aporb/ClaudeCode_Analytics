import { SearchForm } from '@/components/SearchForm'
import { parseSince } from '@/lib/since'
import { getDb } from '@/lib/db'
import { sql } from 'drizzle-orm'
import Link from 'next/link'

interface Row {
  session_id: string
  timestamp: Date
  role: string
  project_path: string | null
  snippet: string
  rank: number
  uuid: string
}

async function runSearch(q: string, project?: string, since?: Date | null): Promise<Row[]> {
  const db = getDb()
  const rows = await db.execute<Record<string, unknown>>(sql`
    SELECT
      m.uuid,
      m.session_id,
      m.timestamp,
      m.role,
      s.project_path,
      ts_headline('english', m.text_content, plainto_tsquery('english', ${q}),
        'MaxWords=30, MinWords=5, ShortWord=2, MaxFragments=1, FragmentDelimiter=" … "'
      ) AS snippet,
      ts_rank(m.text_tsv, plainto_tsquery('english', ${q})) AS rank
    FROM messages m
    LEFT JOIN sessions s USING (session_id)
    WHERE m.text_tsv @@ plainto_tsquery('english', ${q})
      ${since ? sql`AND m.timestamp >= ${since.toISOString()}` : sql``}
      ${project ? sql`AND s.project_path ILIKE ${'%' + project + '%'}` : sql``}
    ORDER BY rank DESC, m.timestamp DESC
    LIMIT 50
  `)
  return rows as unknown as Row[]
}

interface PageProps {
  searchParams: Promise<{ q?: string; project?: string; since?: string }>
}

export default async function SearchPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const q = sp.q?.trim() ?? ''
  const since = sp.since ? parseSince(sp.since) : null
  const rows = q ? await runSearch(q, sp.project, since) : []

  return (
    <main>
      <h1 className="text-xl font-semibold mb-6">Search</h1>
      <SearchForm />
      {q && rows.length === 0 && (
        <p className="text-muted-foreground text-sm">no matches for &quot;{q}&quot;.</p>
      )}
      {q && rows.length > 0 && (
        <p className="text-xs text-muted-foreground mb-4">
          {rows.length} result{rows.length !== 1 ? 's' : ''} for &quot;{q}&quot;
        </p>
      )}
      <ul className="space-y-4">
        {rows.map((r) => (
          <li key={r.uuid} className="border-b pb-3">
            <div className="flex items-baseline justify-between gap-4 mb-1 text-xs text-muted-foreground">
              <span>{new Date(r.timestamp).toISOString().slice(0, 19).replace('T', ' ')} · {r.role}</span>
              <Link
                href={`/session/${r.session_id}#${r.uuid}`}
                className="hover:text-foreground underline underline-offset-4"
              >
                {r.session_id.slice(0, 8)}
              </Link>
            </div>
            <div className="text-xs text-muted-foreground mb-1">{r.project_path ?? '(no project)'}</div>
            <div
              className="text-sm"
              // ts_headline only emits <b>…</b> — safe to inject
              dangerouslySetInnerHTML={{
                __html: r.snippet.replace(/<b>/g, '<b class="bg-yellow-200/50 dark:bg-yellow-500/20">'),
              }}
            />
          </li>
        ))}
      </ul>
    </main>
  )
}
