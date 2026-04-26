import { listSessions } from '@/lib/queries/sessions'
import { SessionsTable } from '@/components/SessionsTable'
import { SessionFilters } from '@/components/SessionFilters'
import { parseSince } from '@/lib/since'

interface PageProps {
  searchParams: Promise<{ project?: string; since?: string; model?: string; page?: string }>
}

const PAGE_SIZE = 50

export default async function HomePage({ searchParams }: PageProps) {
  const sp = await searchParams
  const page = Number(sp.page ?? '1')
  const since = sp.since ? parseSince(sp.since) : null
  const window = since ? { start: since, end: new Date() } : undefined
  const query: Parameters<typeof listSessions>[0] = {
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  }
  if (sp.project) query.project = sp.project
  if (window) query.since = window
  if (sp.model) query.models = [sp.model]
  const rows = await listSessions(query)

  const qs = (p: number) => {
    const params = new URLSearchParams()
    if (sp.project) params.set('project', sp.project)
    if (sp.since) params.set('since', sp.since)
    if (sp.model) params.set('model', sp.model)
    params.set('page', String(p))
    return params.toString()
  }

  return (
    <main>
      <h1 className="text-xl font-semibold mb-6">Sessions</h1>
      <SessionFilters />
      <SessionsTable rows={rows} />
      <div className="flex justify-between items-center mt-6 text-sm text-muted-foreground">
        <span>page {page}</span>
        <div className="flex gap-2">
          {page > 1 && (
            <a href={`?${qs(page - 1)}`} className="underline underline-offset-4">← prev</a>
          )}
          {rows.length === PAGE_SIZE && (
            <a href={`?${qs(page + 1)}`} className="underline underline-offset-4">next →</a>
          )}
        </div>
      </div>
    </main>
  )
}
