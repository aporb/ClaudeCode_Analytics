'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export function SessionFilters() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const next = new URLSearchParams(params.toString())
    for (const [key, value] of form.entries()) {
      const s = String(value).trim()
      if (s) next.set(key, s)
      else next.delete(key)
    }
    router.push(`${pathname}?${next.toString()}`)
  }

  const onReset = () => router.push(pathname)

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap gap-3 mb-6 items-end">
      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">project contains</span>
        <Input name="project" defaultValue={params.get('project') ?? ''} placeholder="e.g. ClaudeCode" className="w-64" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">since</span>
        <Input name="since" defaultValue={params.get('since') ?? ''} placeholder="7d, 24h, 2026-04-01" className="w-48" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">model</span>
        <Input name="model" defaultValue={params.get('model') ?? ''} placeholder="claude-sonnet-4-6" className="w-48" />
      </label>
      <Button type="submit">Apply</Button>
      <Button type="button" variant="ghost" onClick={onReset}>Reset</Button>
    </form>
  )
}
