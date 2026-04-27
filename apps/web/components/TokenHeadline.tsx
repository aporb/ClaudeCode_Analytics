import { parseHosts } from '@/lib/hosts'
import { getTokenTotals } from '@/lib/queries/cost'
import { resolveSince } from '@/lib/since'
import { cookies } from 'next/headers'

/** Humanize a token count: 287_402_991 → "287.4M". Inline helper — no
 *  dependency on a humanize library. */
function humanizeCount(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0'
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

/**
 * Big-number token headline for `/`. Reads the time window from
 * `searchParams.since` and the host filter from `searchParams.host` /
 * `cca-hosts` cookie; re-renders automatically when either changes because
 * server components are recomputed on `searchParams` change.
 */
export async function TokenHeadline({
  searchParams,
}: {
  searchParams: { since?: string; host?: string | string[] }
}) {
  const window = resolveSince(searchParams.since)
  const cookieStore = await cookies()
  const cookieHosts = cookieStore.get('cca-hosts')?.value ?? null
  const hosts = parseHosts({ searchParams, cookieValue: cookieHosts })

  const t = await getTokenTotals({
    sinceStart: window.start,
    sinceEnd: window.end,
    hosts,
  })

  return (
    <div className="border border-border rounded-md p-4">
      <div className="flex items-baseline gap-3">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">Total tokens</span>
        <span className="text-3xl font-bold leading-none tabular-nums">
          {humanizeCount(t.total)}
        </span>
        <span className="text-xs text-muted-foreground">· {window.label}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground tabular-nums">
        <span>
          In: <span className="text-foreground">{humanizeCount(t.input)}</span>
        </span>
        <span>
          Out: <span className="text-foreground">{humanizeCount(t.output)}</span>
        </span>
        <span>
          Cache create: <span className="text-foreground">{humanizeCount(t.cacheCreation)}</span>
        </span>
        <span>
          Read: <span className="text-foreground">{humanizeCount(t.cacheRead)}</span>
        </span>
      </div>
    </div>
  )
}
