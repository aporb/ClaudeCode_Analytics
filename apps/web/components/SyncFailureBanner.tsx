import { cookies } from 'next/headers'
import { getFailingHosts, type FailingHost } from '@/lib/queries/hosts'
import { DismissBannerButton } from './DismissBannerButton'

/**
 * Sync-failure banner — server component, rendered above the global nav.
 *
 * Spec §6.4 / §8.4: surface only when ≥1 host has `consecutive_errors >= 3`.
 * Resolves automatically when the next successful sync resets the counter to 0.
 *
 * Per-host dismissal is sticky to the current error count: the cookie stores
 * `cca-banner-dismissed-{host}={errorCount}`. The banner re-appears once the
 * count changes (i.e. another failure burst lands), without the user having
 * to clear cookies.
 *
 * Resilience: returns `null` on any DB error (e.g. table missing in preview,
 * connection refused) — a banner that crashes the layout is worse than no
 * banner.
 */
export async function SyncFailureBanner() {
  let failing: FailingHost[] = []
  try {
    failing = await getFailingHosts()
  } catch {
    return null
  }
  if (failing.length === 0) return null

  const cookieStore = await cookies()
  const visible = failing.filter((h) => {
    const dismissed = cookieStore.get(`cca-banner-dismissed-${h.host}`)?.value
    return dismissed !== String(h.consecutiveErrors)
  })
  if (visible.length === 0) return null

  return (
    <div role="alert" aria-live="polite" className="border-b border-destructive/40 bg-destructive/10">
      <div className="max-w-7xl mx-auto px-6 py-2 flex flex-col gap-1">
        {visible.map((h) => (
          <SyncFailureRow key={h.host} host={h} />
        ))}
      </div>
    </div>
  )
}

function SyncFailureRow({ host }: { host: FailingHost }) {
  const summary = summariseError(host.lastError)
  return (
    <div className="flex items-center gap-3 text-sm text-destructive">
      <span aria-hidden="true">⚠</span>
      <span className="font-mono flex-1 min-w-0 truncate">
        Sync failing for <strong className="font-semibold">{host.host}</strong> ({host.consecutiveErrors} consecutive errors).
        {summary ? <> Last error: <span className="text-destructive/80">{summary}</span></> : null}
      </span>
      <DismissBannerButton host={host.host} errorCount={host.consecutiveErrors} />
    </div>
  )
}

/** Trim long error strings to one terse line for the banner. */
function summariseError(err: string | null): string | null {
  if (!err) return null
  const firstLine = err.split('\n', 1)[0]?.trim() ?? ''
  if (!firstLine) return null
  return firstLine.length > 140 ? firstLine.slice(0, 137) + '…' : firstLine
}
