'use client'

import { useState } from 'react'

/**
 * Per-host banner dismiss button. Writes a cookie keyed to the current error
 * count so the banner re-appears once the count moves (next failure burst).
 *
 * The cookie is session-scoped (no `Max-Age`) — closing the browser clears it,
 * matching the spec's "dismissible per session" wording.
 */
export function DismissBannerButton({
  host,
  errorCount,
}: {
  host: string
  errorCount: number
}) {
  const [hidden, setHidden] = useState(false)
  if (hidden) return null
  return (
    <button
      type="button"
      onClick={() => {
        document.cookie = `cca-banner-dismissed-${host}=${errorCount}; path=/; SameSite=Lax`
        setHidden(true)
      }}
      className="shrink-0 text-xs px-2 py-0.5 rounded border border-destructive/40 hover:bg-destructive/20 transition-colors"
      aria-label={`Dismiss sync failure banner for ${host}`}
    >
      Dismiss
    </button>
  )
}
