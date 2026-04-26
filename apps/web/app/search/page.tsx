import { SearchForm } from '@/components/SearchForm'
import { parseSince } from '@/lib/since'
import { ftsSearch } from '@/lib/queries/search'
import Link from 'next/link'

interface PageProps {
  searchParams: Promise<{ q?: string; project?: string; since?: string }>
}

export default async function SearchPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const q = sp.q?.trim() ?? ''
  const since = sp.since ? parseSince(sp.since) : null
  const sinceWindow = since ? { start: since, end: new Date() } : undefined
  const rows = q
    ? await ftsSearch({
        q,
        ...(sp.project ? { project: sp.project } : {}),
        ...(sinceWindow ? { since: sinceWindow } : {}),
      })
    : []

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
                href={`/session/${r.sessionId}#${r.uuid}`}
                className="hover:text-foreground underline underline-offset-4"
              >
                {r.sessionId.slice(0, 8)}
              </Link>
            </div>
            <div className="text-xs text-muted-foreground mb-1">{r.projectPath ?? '(no project)'}</div>
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
