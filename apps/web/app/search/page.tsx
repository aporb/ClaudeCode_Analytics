import { cookies } from 'next/headers'
import { ftsSearch, countSearchResults } from '@/lib/queries/search'
import { resolveSince } from '@/lib/since'
import { parseHosts } from '@/lib/hosts'
import { SearchForm } from '@/components/SearchForm'
import { HostChip } from '@/components/HostChip'
import Link from 'next/link'

export default async function SearchPage({ searchParams }: {
  searchParams: Promise<{ q?: string; project?: string; since?: string; model?: string; role?: string; page?: string; host?: string | string[] }>
}) {
  const sp = await searchParams
  const q = sp.q?.trim() ?? ''
  const window = resolveSince(sp.since)
  const role = sp.role === 'user' || sp.role === 'assistant' ? sp.role : undefined
  const models = sp.model ? sp.model.split(',').filter(Boolean) : undefined
  const cookieStore = await cookies()
  const cookieHosts = cookieStore.get('cca-hosts')?.value ?? null
  const hosts = parseHosts({ searchParams: sp, cookieValue: cookieHosts })
  const page = Math.max(1, Number(sp.page ?? 1))
  const limit = 50
  const offset = (page - 1) * limit

  const args: import('@/lib/queries/search').SearchQuery = {
    q,
    ...(sp.project ? { project: sp.project } : {}),
    ...(sp.since ? { since: { start: window.start, end: window.end } } : {}),
    ...(models ? { models } : {}),
    ...(hosts ? { hosts } : {}),
    ...(role ? { role } : {}),
    limit,
    offset,
  }
  const [rows, total] = q
    ? await Promise.all([ftsSearch(args), countSearchResults(args)])
    : [[] as Awaited<ReturnType<typeof ftsSearch>>, 0]

  const last = Math.max(1, Math.ceil(total / limit))

  return (
    <main>
      <h1 className="text-xl font-semibold mb-6">Search</h1>
      <SearchForm />
      {q && (
        <div className="text-xs text-muted-foreground mb-4">
          {total} results · page {page} / {last}
        </div>
      )}
      <ul className="space-y-4">
        {rows.map((r) => (
          <li key={r.uuid} className="border-b pb-3">
            <div className="flex items-baseline justify-between gap-4 mb-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-2">
                <HostChip host={r.host} />
                <span>
                  {new Date(r.timestamp).toISOString().slice(0, 19).replace('T', ' ')} · {r.role}
                  {r.cost !== null && <span className="ml-2">${r.cost.toFixed(2)}</span>}
                </span>
              </span>
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
      {q && total > limit && (
        <div className="flex justify-center gap-3 mt-6 text-sm">
          {page > 1 && <a href={`?${buildQs(sp, page - 1)}`} className="hover:underline">← Prev</a>}
          {page < last && <a href={`?${buildQs(sp, page + 1)}`} className="hover:underline">Next →</a>}
        </div>
      )}
    </main>
  )
}

function buildQs(sp: Record<string, string | string[] | undefined>, page: number): string {
  const entries: [string, string][] = []
  for (const [k, v] of Object.entries(sp)) {
    if (k === 'host') continue // cookie/global filter manages host param
    if (Array.isArray(v)) {
      if (v[0]) entries.push([k, v[0]])
    } else if (v) {
      entries.push([k, v])
    }
  }
  const p = new URLSearchParams(entries)
  p.set('page', String(page))
  return p.toString()
}
