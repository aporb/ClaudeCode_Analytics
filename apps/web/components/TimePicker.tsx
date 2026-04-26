'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useState, useRef, useEffect } from 'react'

const PRESETS = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7d' },
  { value: '30d', label: 'Last 30d' },
  { value: '90d', label: 'Last 90d' },
  { value: 'all', label: 'All time' },
] as const

const COOKIE = 'cca-since'

function labelFor(v: string | undefined): string {
  if (!v) return 'Last 7d'
  const preset = PRESETS.find((p) => p.value === v)
  if (preset) return preset.label
  if (/^\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}$/.test(v)) return v.replace('..', ' → ')
  return 'Last 7d'
}

export function TimePicker({ value }: { value: string | undefined }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [open, setOpen] = useState(false)
  const [customOpen, setCustomOpen] = useState(false)
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setCustomOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  function apply(expr: string) {
    document.cookie = `${COOKIE}=${expr}; path=/; max-age=${60 * 60 * 24 * 365}`
    const next = new URLSearchParams(searchParams.toString())
    next.set('since', expr)
    router.push(`${pathname}?${next.toString()}`)
    setOpen(false)
    setCustomOpen(false)
  }

  function applyCustom() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(customStart) || !/^\d{4}-\d{2}-\d{2}$/.test(customEnd)) return
    apply(`${customStart}..${customEnd}`)
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-sm px-3 py-1.5 rounded-md border border-border hover:bg-muted/50"
      >
        {labelFor(value)} ▾
      </button>
      {open && (
        <div className="absolute right-0 mt-1 z-10 w-48 rounded-md border border-border bg-background shadow-md py-1">
          {PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => apply(p.value)}
              className="block w-full text-left px-3 py-1.5 text-sm hover:bg-muted/50"
            >
              {p.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setCustomOpen((c) => !c)}
            className="block w-full text-left px-3 py-1.5 text-sm hover:bg-muted/50 border-t border-border mt-1 pt-2"
          >
            Custom…
          </button>
          {customOpen && (
            <div className="px-3 py-2 space-y-2 border-t border-border">
              <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)}
                className="w-full text-xs px-2 py-1 rounded border border-border bg-background" />
              <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)}
                className="w-full text-xs px-2 py-1 rounded border border-border bg-background" />
              <button type="button" onClick={applyCustom}
                className="w-full text-xs px-2 py-1 rounded bg-primary text-primary-foreground">
                Apply
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
