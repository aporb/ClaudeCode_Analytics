import { cookies } from 'next/headers'
import { resolveSince } from '@/lib/since'
import { parseHosts } from '@/lib/hosts'
import { listSessions, countSessions } from '@/lib/queries/sessions'
import { SessionsTable } from '@/components/SessionsTable'
import { SessionFilters } from '@/components/SessionFilters'

export default async function SessionsPage({ searchParams }: {
  searchParams: Promise<{ project?: string; since?: string; model?: string; sort?: string; page?: string; host?: string | string[] }>
}) {
  const sp = await searchParams
  const window = resolveSince(sp.since)
  const cookieStore = await cookies()
  const cookieHosts = cookieStore.get('cca-hosts')?.value ?? null
  const hosts = parseHosts({ searchParams: sp, cookieValue: cookieHosts })
  const page = Math.max(1, Number(sp.page ?? 1))
  const limit = 50
  const offset = (page - 1) * limit
  const models = sp.model ? sp.model.split(',').filter(Boolean) : undefined
  const [rows, total] = await Promise.all([
    listSessions({
      ...(sp.project ? { project: sp.project } : {}),
      since: window,
      ...(models ? { models } : {}),
      ...(hosts ? { hosts } : {}),
      sortBy: sp.sort === 'cost' ? 'cost' : 'recent',
      limit,
      offset,
    }),
    countSessions({
      ...(sp.project ? { project: sp.project } : {}),
      since: window,
      ...(models ? { models } : {}),
      ...(hosts ? { hosts } : {}),
    }),
  ])
  // Drop `host` from sp when building pagination links so it doesn't double up
  // with the cookie/URL the global host filter manages.
  const paginationSp: Record<string, string | undefined> = {
    ...(sp.project ? { project: sp.project } : {}),
    ...(sp.since ? { since: sp.since } : {}),
    ...(sp.model ? { model: sp.model } : {}),
    ...(sp.sort ? { sort: sp.sort } : {}),
  }
  return (
    <div className="space-y-4">
      <SessionFilters initial={{ project: sp.project ?? '', model: sp.model ?? '', sort: sp.sort ?? 'recent' }} />
      <SessionsTable rows={rows} />
      <Pagination page={page} total={total} limit={limit} sp={paginationSp} />
    </div>
  )
}

function Pagination({ page, total, limit, sp }:
  { page: number; total: number; limit: number; sp: Record<string, string | undefined> }) {
  const last = Math.max(1, Math.ceil(total / limit))
  const buildHref = (p: number) => {
    const params = new URLSearchParams(Object.entries(sp).filter(([_, v]) => v) as [string, string][])
    params.set('page', String(p))
    return `?${params.toString()}`
  }
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{total} sessions</span>
      <div className="flex gap-2">
        {page > 1 && <a href={buildHref(page - 1)} className="hover:underline">← Prev</a>}
        <span>Page {page} / {last}</span>
        {page < last && <a href={buildHref(page + 1)} className="hover:underline">Next →</a>}
      </div>
    </div>
  )
}
