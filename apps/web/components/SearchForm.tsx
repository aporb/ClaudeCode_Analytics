'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'

const KNOWN_MODELS = [
  { value: 'claude-opus-4-7', label: 'Opus' },
  { value: 'claude-sonnet-4-6', label: 'Sonnet' },
  { value: 'claude-haiku-4-5-20251001', label: 'Haiku' },
]

export function SearchForm() {
  const router = useRouter()
  const params = useSearchParams()
  const initialModels = params.get('model')?.split(',').filter(Boolean) ?? []
  const initialRole = params.get('role') ?? ''
  const [models, setModels] = useState<string[]>(initialModels)
  const [role, setRole] = useState<string>(initialRole)

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const next = new URLSearchParams()
    const q = String(form.get('q') ?? '').trim()
    if (q) next.set('q', q)
    const project = String(form.get('project') ?? '').trim()
    if (project) next.set('project', project)
    if (models.length) next.set('model', models.join(','))
    if (role) next.set('role', role)
    router.push(`/search?${next.toString()}`)
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap gap-3 mb-6 items-end">
      <div className="flex flex-col gap-1 flex-1 min-w-64">
        <label htmlFor="search-q" className="text-xs text-muted-foreground">
          query
        </label>
        <Input
          id="search-q"
          name="q"
          defaultValue={params.get('q') ?? ''}
          placeholder="full-text search"
          autoFocus
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="search-project" className="text-xs text-muted-foreground">
          project
        </label>
        <Input
          id="search-project"
          name="project"
          defaultValue={params.get('project') ?? ''}
          className="w-48"
        />
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">models</span>
        <div className="flex gap-1">
          {KNOWN_MODELS.map((m) => {
            const on = models.includes(m.value)
            return (
              <button
                key={m.value}
                type="button"
                onClick={() =>
                  setModels(on ? models.filter((x) => x !== m.value) : [...models, m.value])
                }
                className={`px-2 py-1 rounded text-xs border ${on ? 'border-foreground bg-muted' : 'border-border opacity-70'}`}
              >
                {m.label}
              </button>
            )
          })}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">role</span>
        <div className="flex gap-1">
          {(['user', 'assistant'] as const).map((r) => {
            const on = role === r
            return (
              <button
                key={r}
                type="button"
                onClick={() => setRole(on ? '' : r)}
                className={`px-2 py-1 rounded text-xs border capitalize ${on ? 'border-foreground bg-muted' : 'border-border opacity-70'}`}
              >
                {r}
              </button>
            )
          })}
        </div>
      </div>
      <Button type="submit">Search</Button>
    </form>
  )
}
