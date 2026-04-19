'use client'

import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useRouter, useSearchParams } from 'next/navigation'

export function SearchForm() {
  const router = useRouter()
  const params = useSearchParams()

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const next = new URLSearchParams()
    const q = String(form.get('q') ?? '').trim()
    if (q) next.set('q', q)
    const project = String(form.get('project') ?? '').trim()
    if (project) next.set('project', project)
    const since = String(form.get('since') ?? '').trim()
    if (since) next.set('since', since)
    router.push(`/search?${next.toString()}`)
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap gap-3 mb-6 items-end">
      <label className="flex flex-col gap-1 flex-1 min-w-64">
        <span className="text-xs text-muted-foreground">query</span>
        <Input name="q" defaultValue={params.get('q') ?? ''} placeholder="full-text search" autoFocus />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">project</span>
        <Input name="project" defaultValue={params.get('project') ?? ''} className="w-48" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">since</span>
        <Input name="since" defaultValue={params.get('since') ?? ''} placeholder="7d" className="w-32" />
      </label>
      <Button type="submit">Search</Button>
    </form>
  )
}
