/**
 * Small color-keyed chip for a host name.
 *
 * Color is a stable hash of the host string so the same host gets the same hue
 * across pages (sessions table, search results, session detail, /hosts cards).
 * Originally this lived inline in apps/web/app/hosts/page.tsx; extracted here
 * in Task 26 so sessions/search/detail can share it.
 */

/** Stable hue for a host label (HSL hash). */
export function hostHue(host: string): number {
  let h = 0
  for (let i = 0; i < host.length; i++) h = (h * 31 + host.charCodeAt(i)) >>> 0
  return h % 360
}

export function HostChip({ host, className = '' }: { host: string; className?: string }) {
  const hue = hostHue(host)
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-mono ${className}`}
      style={{
        borderColor: `hsl(${hue} 60% 45%)`,
        color: `hsl(${hue} 60% 45%)`,
        backgroundColor: `hsl(${hue} 60% 45% / 0.08)`,
      }}
    >
      {host}
    </span>
  )
}
