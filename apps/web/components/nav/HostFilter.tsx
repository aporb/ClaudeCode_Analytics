'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

const COOKIE = 'cca-hosts'

export function HostFilter({
  allHosts,
  current,
}: {
  allHosts: string[]
  current: string[] | null
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  function toggle(host: string) {
    const set = new Set(current ?? allHosts)
    if (set.has(host)) set.delete(host)
    else set.add(host)
    const next = Array.from(set)
    const params = new URLSearchParams(searchParams.toString())
    const isAll = next.length === 0 || next.length === allHosts.length
    if (isAll) params.delete('host')
    else params.set('host', next.join(','))
    const cookieValue = isAll ? '' : (params.get('host') ?? '')
    document.cookie = `${COOKIE}=${cookieValue}; path=/; max-age=${60 * 60 * 24 * 365}`
    const qs = params.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }

  const isAll = !current || current.length === allHosts.length
  const label = isAll ? 'host: all' : `host: ${current!.join(', ')}`

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="text-sm px-3 py-1.5 rounded-md border border-border hover:bg-muted/50"
      >
        {label} ▾
      </button>
      {open && (
        <div className="absolute right-0 mt-1 z-10 w-48 rounded-md border border-border bg-background shadow-md py-1">
          {allHosts.length === 0 && (
            <div className="px-3 py-1.5 text-xs text-muted-foreground">No hosts</div>
          )}
          {allHosts.map((h) => {
            const checked = !current || current.includes(h)
            return (
              <label
                key={h}
                className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted/50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  aria-label={h}
                  checked={checked}
                  onChange={() => toggle(h)}
                  className="h-3.5 w-3.5 accent-foreground"
                />
                <span>{h}</span>
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}
