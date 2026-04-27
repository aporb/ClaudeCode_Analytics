import { HostChip } from '@/components/HostChip'
import { Card } from '@/components/ui/card'
import { parseHosts } from '@/lib/hosts'
import { type HostStats, getHostStats } from '@/lib/queries/hosts'
import { resolveSince } from '@/lib/since'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { cookies } from 'next/headers'

dayjs.extend(relativeTime)

const NUMBER = new Intl.NumberFormat('en-US')
const USD = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
})

function SyncDot({ consecutiveErrors }: { consecutiveErrors: number }) {
  const color =
    consecutiveErrors === 0
      ? 'bg-emerald-500'
      : consecutiveErrors <= 2
        ? 'bg-amber-500'
        : 'bg-red-500'
  const label =
    consecutiveErrors === 0
      ? 'healthy'
      : consecutiveErrors <= 2
        ? `${consecutiveErrors} recent error${consecutiveErrors === 1 ? '' : 's'}`
        : `${consecutiveErrors} consecutive errors`
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" title={label}>
      <span className={`inline-block h-2 w-2 rounded-full ${color}`} aria-hidden />
      {label}
    </span>
  )
}

function RelTime({ date }: { date: Date | null }) {
  if (!date) return <span className="text-muted-foreground">never</span>
  const d = dayjs(date)
  return (
    <span title={d.format('YYYY-MM-DD HH:mm:ss Z')}>
      {d.fromNow()}
      <span className="text-muted-foreground"> · {d.format('MMM D, HH:mm')}</span>
    </span>
  )
}

function TokenBar({ stats }: { stats: HostStats }) {
  const total =
    stats.totalInputTokens +
    stats.totalOutputTokens +
    stats.totalCacheCreation +
    stats.totalCacheRead
  if (total === 0) return <div className="text-xs text-muted-foreground">no tokens in window</div>
  const pct = (n: number) => (n / total) * 100
  return (
    <div className="space-y-1">
      <div className="flex h-2 rounded overflow-hidden bg-muted">
        <div
          className="bg-sky-500"
          style={{ width: `${pct(stats.totalInputTokens)}%` }}
          title={`input · ${NUMBER.format(stats.totalInputTokens)}`}
        />
        <div
          className="bg-violet-500"
          style={{ width: `${pct(stats.totalOutputTokens)}%` }}
          title={`output · ${NUMBER.format(stats.totalOutputTokens)}`}
        />
        <div
          className="bg-amber-500"
          style={{ width: `${pct(stats.totalCacheCreation)}%` }}
          title={`cache create · ${NUMBER.format(stats.totalCacheCreation)}`}
        />
        <div
          className="bg-emerald-500"
          style={{ width: `${pct(stats.totalCacheRead)}%` }}
          title={`cache read · ${NUMBER.format(stats.totalCacheRead)}`}
        />
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
        <span>
          <span className="inline-block h-2 w-2 rounded-sm bg-sky-500 align-middle mr-1" />
          in {NUMBER.format(stats.totalInputTokens)}
        </span>
        <span>
          <span className="inline-block h-2 w-2 rounded-sm bg-violet-500 align-middle mr-1" />
          out {NUMBER.format(stats.totalOutputTokens)}
        </span>
        <span>
          <span className="inline-block h-2 w-2 rounded-sm bg-amber-500 align-middle mr-1" />
          cache+ {NUMBER.format(stats.totalCacheCreation)}
        </span>
        <span>
          <span className="inline-block h-2 w-2 rounded-sm bg-emerald-500 align-middle mr-1" />
          cache✓ {NUMBER.format(stats.totalCacheRead)}
        </span>
      </div>
    </div>
  )
}

function HostCard({ stats }: { stats: HostStats }) {
  return (
    <Card className="p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <HostChip host={stats.host} />
        <SyncDot consecutiveErrors={stats.consecutiveErrors} />
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Last sync</div>
          <RelTime date={stats.lastPulledAt} />
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Last active
          </div>
          <RelTime date={stats.lastActiveAt} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Sessions</div>
          <div className="font-bold tabular-nums">{NUMBER.format(stats.sessionCount)}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Cost</div>
          <div className="font-bold tabular-nums">{USD.format(stats.estimatedCostUsd)}</div>
        </div>
      </div>

      <div>
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Tokens</div>
        <TokenBar stats={stats} />
      </div>

      <div>
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Top model</div>
        <div className="text-sm font-mono">
          {stats.topModel ?? <span className="text-muted-foreground">—</span>}
          {stats.topModel && (
            <span className="text-muted-foreground"> · {USD.format(stats.topModelCost)}</span>
          )}
        </div>
      </div>

      {stats.lastError && (
        <div className="text-xs text-red-500 truncate" title={stats.lastError}>
          ⚠ {stats.lastError}
        </div>
      )}
    </Card>
  )
}

export default async function HostsPage({
  searchParams,
}: {
  searchParams: Promise<{ since?: string; host?: string | string[] }>
}) {
  const sp = await searchParams
  const window = resolveSince(sp.since)
  const cookieStore = await cookies()
  const cookieHosts = cookieStore.get('cca-hosts')?.value ?? null
  const filter = parseHosts({ searchParams: sp, cookieValue: cookieHosts })
  const all = await getHostStats({ sinceStart: window.start, sinceEnd: window.end })
  const visible = filter ? all.filter((h) => filter.includes(h.host)) : all

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-bold">Hosts · {window.label}</h1>
        <span className="text-sm text-muted-foreground tabular-nums">
          {visible.length} of {all.length}
        </span>
      </div>
      {visible.length === 0 ? (
        <div className="border border-dashed border-border rounded-md p-8 text-center text-sm text-muted-foreground">
          No hosts have sessions in this window.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {visible.map((s) => (
            <HostCard key={s.host} stats={s} />
          ))}
        </div>
      )}
    </div>
  )
}
